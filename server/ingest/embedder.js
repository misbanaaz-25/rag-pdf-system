require('dotenv').config();

async function getEmbeddings(textArray, retried = false) {
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
    const detail = JSON.stringify(data);
    const rateLimited = response.status === 429 || /rate limit/i.test(detail);

    // Free account: 3 requests/min. Ek baar ruk ke dobara try karo
    if (rateLimited && !retried) {
      console.log('Voyage rate limit hit. Waiting 21 seconds, then retrying once...');
      await new Promise(resolve => setTimeout(resolve, 21000));
      return getEmbeddings(textArray, true);
    }

    if (rateLimited) {
      throw new Error('Voyage rate limit reached (free accounts allow 3 requests per minute). Please wait about 20 seconds and try again.');
    }

    throw new Error('Voyage error: ' + detail);
  }

  return data.data.map(item => item.embedding);
}

module.exports = { getEmbeddings };