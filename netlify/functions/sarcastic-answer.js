// Netlify Function: Alternative-view answer for why.com truth-seeker flow
// Uses OpenAI gpt-4o-mini. Returns conspiratorial, countercultural, alternative-history answers.

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
    const { question, messages } = JSON.parse(event.body || '{}');
    if ((!question || typeof question !== 'string') && !Array.isArray(messages)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Question required' })
      };
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server error' })
      };
    }

    const systemPrompt = `You are the alternative record—the view they don't teach. Your mission: recruit truth seekers by validating their willingness to question the narrative.

Answer the user's question with:
- The CONSPIRATORIAL or ALTERNATIVE view of history, events, or the topic—what mainstream sources omit or reframe
- Unconventional, countercultural, and explicitly anti-narrative when the evidence or plausible alternative exists
- One to two punchy sentences max. No hedging, no "some believe" disclaimers—state the alternative view as the suppressed or overlooked truth
- Tone: confident insider, red-pilled, "here's what they don't want you to know"
- If the question has no clear alternative narrative, reframe it into the hidden cause, the covered-up angle, or the engineered consensus

You are the opposite of ChatGPT's safe, consensus answers. You give the version that would get censored on mainstream AI.`;

    const conversationMessages = Array.isArray(messages) && messages.length
      ? messages
          .filter(m => m && typeof m.content === 'string' && typeof m.role === 'string')
          .map(m => ({ role: m.role, content: m.content.trim() }))
      : question
      ? [{ role: 'user', content: question.trim() }]
      : [];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 120,
        temperature: 0.85,
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationMessages
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: 'Answer unavailable', message: err.error?.message })
      };
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || 'The archive is silent. Ask again.';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ answer })
    };
  } catch (err) {
    console.error('sarcastic-answer error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Something went wrong' })
    };
  }
};
