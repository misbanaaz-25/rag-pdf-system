const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { chunkText } = require('./ingest/chunker');
const { getEmbeddings } = require('./ingest/embedder');
const { addToStore, getDocuments, getDocumentChunks, deleteDocument } = require('./ingest/store');
const { searchSimilarChunks } = require('./ingest/search');
const { generateAnswer } = require('./ingest/generate');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

// ---- Helpers ----
// Itne ya kam chunks wali PDF "chhoti" maani jayegi: poori seedha model ko denge
const SMALL_DOC_MAX_CHUNKS = 4;

// "is PDF mein kya hai?" jaise sawaal pehchanne ke liye
function isOverviewQuestion(query) {
  const q = query.toLowerCase();
  if (q.split(/\s+/).length > 16) return false;
  if (/(summar|overview|gist|\bsaar\b)/.test(q)) return true;

  const mentionsDoc = /\b(pdf|file|document|doc)\b/.test(q);
  const asksAbout = /(inside|content|about|explain|describe|title|topic|name|kya|batao|samjha|what is|what's|whats)/.test(q);
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

app.get('/', (req, res) => {
  res.send('RAG server is running! 🚀');
});

// Stored PDFs ki list
app.get('/documents', (req, res) => {
  res.json({ documents: getDocuments() });
});

// Ek PDF delete karo
app.delete('/documents/:filename', (req, res) => {
  const removed = deleteDocument(req.params.filename);

  if (removed === 0) {
    return res.status(404).json({ error: 'Document not found.' });
  }

  res.json({ message: 'Document deleted.', filename: req.params.filename });
});

app.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file received.' });
    }

    const fileBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(fileBuffer);

    // Scanned PDF: text hota hi nahi
    if (!data.text || data.text.trim().length < 20) {
      fs.unlinkSync(req.file.path);
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
  }
});

app.post('/search', async (req, res) => {
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

app.post('/chat', async (req, res) => {
  try {
    const { query, language, filename } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Sawaal (query) nahi mila!' });
    }

    const { mode, chunks, sources } = await pickContext(query, filename);

    console.log('Chat request | language:', language, '| document:', filename || 'all', '| mode:', mode, '| chunks:', chunks.length);

    if (chunks.length === 0) {
      return res.json({
        query,
        answer: 'Please upload a PDF first, then ask your question.',
        sources: []
      });
    }

    const answer = await generateAnswer(query, chunks, language, mode === 'overview' ? 'overview' : 'question');

    res.json({ query, answer, sources });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server chal raha hai: http://localhost:${PORT}`);
});