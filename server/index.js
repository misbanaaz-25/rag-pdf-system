const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Multer setup — batata hai file kahan save karni hai
const upload = multer({ dest: 'uploads/' });

// Test route
app.get('/', (req, res) => {
  res.send('RAG server is running! 🚀');
});

// PDF upload route
app.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Koi file nahi mili!' });
    }

    // File ko read karo
    const fileBuffer = fs.readFileSync(req.file.path);

    // PDF se text nikalo
    const data = await pdfParse(fileBuffer);

    res.json({
      message: 'PDF successfully padhi gayi!',
      filename: req.file.originalname,
      totalPages: data.numpages,
      textPreview: data.text.substring(0, 500) // pehle 500 characters
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