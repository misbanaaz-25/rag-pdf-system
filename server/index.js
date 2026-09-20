const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { chunkText } = require('./ingest/chunker');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Multer setup — batata hai file kahan save karni hai
const upload = multer({ dest: 'uploads/' });

// Test route
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

    // Text ko chunks mein todo
    const chunks = chunkText(data.text);

    res.json({
      message: 'PDF successfully padhi gayi aur chunks bhi ban gaye!',
      filename: req.file.originalname,
      totalPages: data.numpages,
      totalChunks: chunks.length,
      firstChunkPreview: chunks[0]
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Kuch gadbad ho gayi' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server chal raha hai: http://localhost:${PORT}`);
});