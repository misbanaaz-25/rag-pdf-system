require('dotenv').config();
console.log('Key loaded:', process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.substring(0, 10) + '...' : 'NOT FOUND');

async function generateAnswer(query, contextChunks) {
  const context = contextChunks.map(c => c.text).join('\n\n---\n\n');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'user',
          content: `Neeche diye gaye context ke basis pe sawaal ka jawab do. Agar context mein jawab nahi hai, toh saaf keh do "Is document mein ye jaankari nahi hai."

Context:
${context}

Sawaal: ${query}`
        }
      ]
    })
  });

  const data = await response.json();
  console.log('Groq response:', data);
  return data.choices[0].message.content;
}

module.exports = { generateAnswer };