const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { chunkText } = require('./ingest/chunker');
const { getEmbeddings } = require('./ingest/embedder');
const { addToStore, getDocuments, deleteDocument } = require('./ingest/store');
const { searchSimilarChunks } = require('./ingest/search');
const { generateAnswer } = require('./ingest/generate');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

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
    console.log('Chat request, language:', language, '| document:', filename || 'all');

    if (!query) {
      return res.status(400).json({ error: 'Sawaal (query) nahi mila!' });
    }

    const relevantChunks = await searchSimilarChunks(query, 3, filename || null);

    if (relevantChunks.length === 0) {
      return res.json({
        query,
        answer: 'Please upload a PDF first, then ask your question.',
        sources: []
      });
    }

    const answer = await generateAnswer(query, relevantChunks, language);

    res.json({
      query,
      answer,
      sources: relevantChunks.map(c => ({ filename: c.filename, score: c.score }))
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server chal raha hai: http://localhost:${PORT}`);
});