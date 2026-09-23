const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { chunkText } = require('./ingest/chunker');
const { getEmbeddings } = require('./ingest/embedder');
const { addToStore } = require('./ingest/store');
const { searchSimilarChunks } = require('./ingest/search');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

app.get('/', (req, res) => {
  res.send('RAG server is running! 🚀');
});

app.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Koi file nahi mili!' });
    }

    const fileBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(fileBuffer);

    const chunks = chunkText(data.text);
    const embeddings = await getEmbeddings(chunks);
    addToStore(req.file.originalname, chunks, embeddings);

    res.json({
      message: 'PDF processed: chunked & embedded!',
      filename: req.file.originalname,
      totalPages: data.numpages,
      totalChunks: chunks.length,
      totalEmbeddings: embeddings.length,
      firstEmbeddingLength: embeddings[0].length
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Kuch gadbad ho gayi' });
  }
});

// 👇 YE NAYA ROUTE ADD KARNA HAI YAHAN 👇
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
    res.status(500).json({ error: 'Kuch gadbad ho gayi' });
  }
});
// 👆 YAHAN TAK 👆

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server chal raha hai: http://localhost:${PORT}`);
});