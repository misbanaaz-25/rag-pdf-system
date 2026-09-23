const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '../../data/vectorStore.json');

// Data folder aur file na ho toh bana do
function ensureStoreExists() {
  const dataDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify([]));
  }
}

// Naye chunks + embeddings store mein add karo
function addToStore(filename, chunks, embeddings) {
  ensureStoreExists();

  const store = JSON.parse(fs.readFileSync(STORE_FILE));

  chunks.forEach((chunk, i) => {
    store.push({
      filename,
      text: chunk,
      embedding: embeddings[i]
    });
  });

  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

// Poora store wapas do (baad mein search karne ke liye)
function getStore() {
  ensureStoreExists();
  return JSON.parse(fs.readFileSync(STORE_FILE));
}

module.exports = { addToStore, getStore };