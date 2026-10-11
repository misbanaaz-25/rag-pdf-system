require('dotenv').config();

const LANGUAGE_RULES = {
  english: {
    name: 'English',
    style: 'Write in clear, natural English.',
    notFound: "This information isn't in the document."
  },
  hindi: {
    name: 'Hindi',
    style: 'Write in simple, natural Hindi using Devanagari script, the way an educated person speaks in everyday conversation. Avoid heavy Sanskritized or bookish words. Common technical words like PDF, assignment, server may stay in English.',
    notFound: 'यह जानकारी दस्तावेज़ में नहीं है।'
  },
  hinglish: {
    name: 'Hinglish',
    style: 'Write in Hinglish: Hindi in Roman letters mixed naturally with common English words, the way young urban Indians chat. Keep it polite, clean and easy to read. No rural slang, no dramatic phrases, no overly formal Hindi.',
    notFound: 'Ye information document mein nahi hai.'
  }
};

async function generateAnswer(query, contextChunks, language = 'hinglish') {
  const rules = LANGUAGE_RULES[language] || LANGUAGE_RULES.hinglish;
  const context = contextChunks.map(c => c.text).join('\n\n---\n\n');

  const systemPrompt = `You are DocMind, a friendly assistant that answers questions about the user's uploaded PDF documents.

OUTPUT LANGUAGE: ${rules.name}. ${rules.style}
Always reply in ${rules.name}, even if the user's question is written in a different language.

Rules:
1. If the user sends a greeting or small talk (like "hey" or "thanks"), reply warmly and briefly, and mention you can help with questions about their documents.
2. For questions about the document, answer ONLY from the context provided. Never make things up.
3. If the context does not contain the answer, reply with this sentence: "${rules.notFound}"
4. Keep answers short and clear.
5. Plain text only. Do not use markdown: no asterisks, no # headings, no backticks. If you need a list, use simple lines like "1." and "2.".`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Context:\n${context}\n\nQuestion: ${query}\n\n(Reply in ${rules.name}.)`
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