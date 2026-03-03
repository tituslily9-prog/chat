// Netlify Function: Generate wiki-format article using OpenAI
// Same OpenAI pattern as chat.js — uses OPENAI_API_KEY from env

const WIKI_SYSTEM_PROMPT = `You are an encyclopedic wiki editor. Generate a short wiki article in markdown.

RULES:
- Use markdown. Use [[double brackets]] for internal wiki links (e.g. [[AI]], [[Machine Learning]]).
- Use bullet points for the References section.
- Tag AI suggestions for human editors with: <!-- AI SUGGESTION: your note here -->
- Language: neutral, encyclopedic. No marketing or opinion.
- Structure exactly:
  1. One introductory paragraph summarizing the topic (2-4 sentences).
  2. Exactly 3-4 subheadings (##), each with 2-3 sentences. Each subheading must cover a unique aspect.
  3. ## References — bullet list with placeholder citations like "[1] Placeholder", "[2] Placeholder".
  4. ## Why Experts Notes — 1-2 short bullet points. Include at least one <!-- AI SUGGESTION --> for experts to verify or add citations.

When the topic involves AI collaboration, multi-agent systems, or related areas, include cross-links to related pages (e.g. [[AI]], [[Machine Learning]], [[Multi-Agent Systems]]). Add inline <!-- AI SUGGESTION --> comments where experts should add citations or verify statements. For complex topics that span multiple articles, add a brief <!-- AI SUGGESTION --> suggesting multi-page reasoning or a "See also" note.

Output only the raw markdown article, no wrapper text.`;

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
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON' })
      };
    }

    const topic = (body.topic || '').trim();
    if (!topic) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Topic is required' })
      };
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'OPENAI_API_KEY not configured' })
      };
    }

    const userPrompt = `Generate a wiki article for the following topic. Follow the exact structure and rules (markdown, [[links]], <!-- AI SUGGESTION -->, References, Why Experts Notes).\n\nTopic: ${topic}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1200,
        temperature: 0.5,
        messages: [
          { role: 'system', content: WIKI_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || response.statusText || 'OpenAI request failed';
      return {
        statusCode: response.status >= 500 ? 502 : response.status,
        headers,
        body: JSON.stringify({ error: 'AI generation failed', message: msg })
      };
    }

    const result = await response.json();
    const markdown = (result.choices?.[0]?.message?.content || '').trim();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, markdown })
    };
  } catch (error) {
    console.error('wiki-generate error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message || 'Unknown error'
      })
    };
  }
};
