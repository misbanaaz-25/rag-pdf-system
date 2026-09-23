require('dotenv').config();

async function testEmbedding() {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: ['Misba is building a RAG system'],
      model: 'voyage-3'
    })
  });

  const data = await response.json();
  console.log(data);
}

testEmbedding();