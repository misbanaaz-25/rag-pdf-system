const { getStore } = require('./store');
const { getEmbeddings } = require('./embedder');

// Do vectors ke beech cosine similarity nikalta hai
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

// User ke sawaal ke liye sabse relevant chunks dhoondta hai
async function searchSimilarChunks(query, topK = 3) {
  // Sawaal ka embedding banao
  const [queryEmbedding] = await getEmbeddings([query]);

  // Saare stored chunks lao
  const store = getStore();

  // Har chunk ka similarity score nikalo
  const scored = store.map(item => ({
    ...item,
    score: cosineSimilarity(queryEmbedding, item.embedding)
  }));

  // Sabse high score wale upar layo, aur sirf top K chunks lo
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

module.exports = { searchSimilarChunks };