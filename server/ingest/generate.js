require('dotenv').config();

async function generateAnswer(query, contextChunks) {
  const context = contextChunks.map(c => c.text).join('\n\n---\n\n');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
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

  if (!data.choices) {
    throw new Error('Groq error: ' + JSON.stringify(data));
  }

  return data.choices[0].message.content;
}

module.exports = { generateAnswer };