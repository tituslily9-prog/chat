// Netlify Function: Q&A about the current article (wiki/civil page)
// Same OpenAI pattern as chat.js — uses OPENAI_API_KEY from env

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const message = (body.message || '').trim();
    const context = (body.context || '').trim();

    if (!message) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'message is required' }) };
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'OPENAI_API_KEY not configured' }) };
    }

    const systemPrompt = context
      ? `You are a WHY-focused assistant: your primary job is to help users understand reasons, causes, motivations, and "why" questions about the Wikipedia-style article they are reading. When they ask why something happened or why something is the case, use the article content below to give clear, grounded answers. You may also answer other questions about the article (facts, who, when, what) and respond reasonably to general or off-topic requests—you are not limited to the article for casual conversation—but when the question is about the article, base your answer on the content. If the answer is not in the content, say so briefly. Keep answers concise and encyclopedic when discussing the article.\n\n--- Article content ---\n${context.slice(0, 25000)}\n--- End ---`
      : 'You are a WHY-focused assistant. The user is reading an article; answer their question briefly, especially "why" questions. If they ask about the article and no context was provided, ask them to try again or give a short general answer.';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 400,
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        statusCode: response.status >= 500 ? 502 : response.status,
        headers,
        body: JSON.stringify({ error: 'AI request failed', message: err.error?.message || response.statusText })
      };
    }

    const result = await response.json();
    const reply = (result.choices?.[0]?.message?.content || '').trim();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, response: reply })
    };
  } catch (error) {
    console.error('article-chat error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', message: error.message })
    };
  }
};
