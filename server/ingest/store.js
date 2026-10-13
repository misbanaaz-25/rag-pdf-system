const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'vectorStore.json');

function ensureStoreExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify([]));
  }
}

function getStore() {
  ensureStoreExists();
  return JSON.parse(fs.readFileSync(STORE_FILE));
}

function saveStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

// Same filename dobara aaye toh purane chunks hata ke naye daalo
function addToStore(filename, chunks, embeddings) {
  const store = getStore().filter(item => item.filename !== filename);

  chunks.forEach((chunk, i) => {
    store.push({
      filename,
      text: chunk,
      embedding: embeddings[i]
    });
  });

  saveStore(store);
}

// Stored PDFs ke unique naam
function getDocuments() {
  return [...new Set(getStore().map(item => item.filename))];
}

// Ek PDF ke chunks, document ke order mein (khaali chunks chhod ke)
function getDocumentChunks(filename) {
  return getStore().filter(
    item => item.filename === filename && item.text && item.text.trim()
  );
}

// Ek PDF ke saare chunks hata do. Kitne chunks hate, wo number wapas deta hai
function deleteDocument(filename) {
  const store = getStore();
  const remaining = store.filter(item => item.filename !== filename);
  const removed = store.length - remaining.length;

  if (removed > 0) {
    saveStore(remaining);
  }
  return removed;
}

module.exports = { addToStore, getStore, getDocuments, getDocumentChunks, deleteDocument };