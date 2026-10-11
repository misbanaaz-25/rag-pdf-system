const { getStore } = require('./store');
const { getEmbeddings } = require('./embedder');

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// filename dene pe search sirf usi PDF mein hoga
async function searchSimilarChunks(query, topK = 3, filename = null) {
  const [queryEmbedding] = await getEmbeddings([query]);

  // Khaali chunks ignore karo
  let store = getStore().filter(item => item.text && item.text.trim());

  if (filename) {
    store = store.filter(item => item.filename === filename);
  }

  if (store.length === 0) return [];

  const scored = store.map(item => ({
    ...item,
    score: cosineSimilarity(queryEmbedding, item.embedding)
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

module.exports = { searchSimilarChunks };