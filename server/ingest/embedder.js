require('dotenv').config();

async function getEmbeddings(textArray) {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: textArray,
      model: 'voyage-3'
    })
  });

  const data = await response.json();

  if (!data.data) {
    throw new Error('Voyage error: ' + JSON.stringify(data));
  }

  return data.data.map(item => item.embedding);
}

module.exports = { getEmbeddings };