function chunkText(text, chunkSize = 500, overlap = 50) {
  const words = text.split(/\s+/); // text ko words mein todo
  const chunks = [];

  let i = 0;
  while (i < words.length) {
    const chunkWords = words.slice(i, i + chunkSize);
    chunks.push(chunkWords.join(' '));
    i += chunkSize - overlap; // thoda overlap rakhte hain continuity ke liye
  }

  return chunks;
}

module.exports = { chunkText };