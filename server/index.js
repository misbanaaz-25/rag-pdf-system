const express = require('express');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { chunkText } = require('./ingest/chunker');
const { getEmbeddings } = require('./ingest/embedder');
const { addToStore, getDocuments, getDocumentChunks, deleteDocument } = require('./ingest/store');
const { searchSimilarChunks } = require('./ingest/search');
const { generateAnswer } = require('./ingest/generate');
const { initDb } = require('./db');
const { router: authRouter, attachUser, requireAuth } = require('./auth');

const app = express();

// Live hone par (Render/Railway jaisi hosting) ek proxy beech mein hoti hai
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(express.json());
app.use(cookieParser());
app.use(attachUser);   // har request pe pata karo ki kaun login hai

const upload = multer({ dest: 'uploads/' });

// ---- Helpers ----
// Itne ya kam chunks wali PDF "chhoti" maani jayegi: poori seedha model ko denge
const SMALL_DOC_MAX_CHUNKS = 4;

// "hi", "hello", "thanks", "kaise ho" jaise sirf greeting wale messages
function isGreeting(query) {
  const q = query.toLowerCase().trim().replace(/[!.,?\s]+$/g, '');
  return /^(hi+|hii+|hello+|hey+|heya|hola|namaste|namaskar|नमस्ते|नमस्कार|good (morning|afternoon|evening|night)|thanks|thank you|thankyou|shukriya|dhanyavad|धन्यवाद|शुक्रिया|kaise ho|kese ho|how are you|who are you|tum kaun ho|aap kaun ho|what can you do|ok|okay|bye)( (there|buddy|bhai|yaar|docmind|dost|friend|everyone|sir|mam|ji|a lot|so much))?$/.test(q);
}

// "is PDF mein kya hai?" jaise sawaal pehchanne ke liye
function isOverviewQuestion(query) {
  const q = query.toLowerCase();
  if (q.split(/\s+/).length > 16) return false;
  if (/(summar|overview|gist|\bsaar\b|सारांश|संक्षेप)/.test(q)) return true;
  if (/^(name|title|naam|topic)\s*\??$/.test(q.trim())) return true;

  const mentionsDoc = /\b(pdf|file|document|doc)\b/.test(q);
  const asksAbout = /(inside|content|about|explain|describe|title|topic|name|kya|batao|samjha|what is|what's|whats|शीर्षक|क्या|बता|बारे|मुख्य|विषय|नाम)/.test(q);
  return mentionsDoc && asksAbout;
}

// Shuru se aakhir tak barabar doori pe se max chunks uthao
function sampleEvenly(items, max) {
  if (items.length <= max) return items;
  const picked = [];
  for (let i = 0; i < max; i++) {
    picked.push(items[Math.round((i * (items.length - 1)) / (max - 1))]);
  }
  return picked;
}

// Sawaal ke liye kaunse chunks model ko bhejne hain, ye yahan tay hota hai
async function pickContext(query, filename) {
  const docChunks = filename ? getDocumentChunks(filename) : [];

  // 0) Greeting: search nahi, bas shuru ke 2 chunks (taaki assistant bata sake PDF kis baare mein hai)
  if (isGreeting(query)) {
    return { mode: 'greeting', chunks: docChunks.slice(0, 2), sources: [] };
  }

  // 1) Poore document ka overview
  if (docChunks.length > 0 && isOverviewQuestion(query)) {
    return { mode: 'overview', chunks: sampleEvenly(docChunks, 5), sources: [] };
  }

  // 2) Chhoti PDF: search nahi, poora document (Voyage ki limit bhi nahi lagti)
  if (docChunks.length > 0 && docChunks.length <= SMALL_DOC_MAX_CHUNKS) {
    return { mode: 'whole-document', chunks: docChunks, sources: [] };
  }

  // 3) Badi PDF: similarity search
  const found = await searchSimilarChunks(query, 3, filename || null);
  return {
    mode: 'search',
    chunks: found,
    sources: found.map(c => ({ filename: c.filename, score: c.score }))
  };
}
// ---- END HELPERS ----

// ---- Pages: login ke bina app nahi, login ke baad login page nahi ----
app.get(['/', '/index.html'], (req, res, next) => {
  if (!req.user) return res.redirect('/login.html');
  next();
});

app.get('/login.html', (req, res, next) => {
  if (req.user) return res.redirect('/');
  next();
});

app.use(express.static('public'));

// ---- Auth: signup, login, logout, me ----
app.use('/auth', authRouter);

// ---- Documents (login zaroori) ----
// Stored PDFs ki list
app.get('/documents', requireAuth, (req, res) => {
  res.json({ documents: getDocuments() });
});

// Ek PDF delete karo
app.delete('/documents/:filename', requireAuth, (req, res) => {
  const removed = deleteDocument(req.params.filename);

  if (removed === 0) {
    return res.status(404).json({ error: 'Document not found.' });
  }

  res.json({ message: 'Document deleted.', filename: req.params.filename });
});

app.post('/upload', requireAuth, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file received.' });
    }

    const fileBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(fileBuffer);

    // Scanned PDF: text hota hi nahi
    if (!data.text || data.text.trim().length < 20) {
      return res.status(422).json({
        error: 'No selectable text found in this PDF (it may be scanned). Please upload a text-based PDF.'
      });
    }

    const chunks = chunkText(data.text);
    const embeddings = await getEmbeddings(chunks);
    addToStore(req.file.originalname, chunks, embeddings);

    res.json({
      message: 'PDF processed, embedded & stored!',
      filename: req.file.originalname,
      totalPages: data.numpages,
      totalChunks: chunks.length,
      totalEmbeddings: embeddings.length
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    // Asli PDF file disk pe rakhne ki zaroorat nahi, text already store ho chuka hai
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

app.post('/search', requireAuth, async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Sawaal (query) nahi mila!' });
    }

    const results = await searchSimilarChunks(query);

    res.json({
      query,
      results: results.map(r => ({
        filename: r.filename,
        text: r.text,
        score: r.score
      }))
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/chat', requireAuth, async (req, res) => {
  try {
    const { query, language, filename } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Sawaal (query) nahi mila!' });
    }

    const { mode, chunks, sources } = await pickContext(query, filename);

    console.log('Chat request | user:', req.user.id, '| language:', language, '| document:', filename || 'all', '| mode:', mode, '| chunks:', chunks.length);

    if (chunks.length === 0 && mode !== 'greeting') {
      return res.json({
        query,
        answer: 'Please upload a PDF first, then ask your question.',
        sources: []
      });
    }

    const answerMode = (mode === 'overview' || mode === 'greeting') ? mode : 'question';
    const answer = await generateAnswer(query, chunks, language, answerMode, filename || null);

    res.json({ query, answer, sources });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;

// Pehle database ready karo, phir server chalao
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server chal raha hai: http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.error('Server start nahi hua. Database error:', error.message);
    console.error('Check karo: MySQL chal raha hai aur .env ke DB_* values sahi hain.');
    process.exit(1);
  });