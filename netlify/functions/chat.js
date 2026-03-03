// Netlify Function: Chat API endpoint for whyOS
// Uses OpenAI GPT-4o-mini for cost efficiency with identical voice and tone

// In-memory rate limiting
const requestCounts = new Map();
const RATE_LIMIT_MAX = 20; // Higher limit for chat
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms

function normalizeTextForFilter(text = '') {
  const leetMap = {
    '0': 'o',
    '1': 'i',
    '!': 'i',
    '|': 'i',
    '3': 'e',
    '4': 'a',
    '@': 'a',
    '5': 's',
    '$': 's',
    '7': 't'
  };

  return text
    .toLowerCase()
    .split('')
    .map(char => leetMap[char] || char)
    .join('')
    .replace(/[^a-z]/g, '');
}

function containsProhibitedLanguage(text = '') {
  const normalized = normalizeTextForFilter(text);
  if (!normalized) return false;
  return normalized.includes('nigg');
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of requestCounts.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      requestCounts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// Rate limiting check
function checkRateLimit(ip) {
  const now = Date.now();
  const data = requestCounts.get(ip);
  
  if (!data) {
    requestCounts.set(ip, { count: 1, timestamp: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  
  if (now - data.timestamp > RATE_LIMIT_WINDOW) {
    requestCounts.set(ip, { count: 1, timestamp: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  
  if (data.count >= RATE_LIMIT_MAX) {
    return { 
      allowed: false, 
      remaining: 0,
      resetTime: new Date(data.timestamp + RATE_LIMIT_WINDOW)
    };
  }
  
  data.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - data.count };
}

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  try {
    // Rate limiting
    const clientIP = event.headers['x-forwarded-for'] || 
                     event.headers['client-ip'] || 
                     context.clientContext?.ip || 
                     'unknown';
    
    const rateLimit = checkRateLimit(clientIP);
    
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers: {
          ...headers,
          'X-RateLimit-Limit': RATE_LIMIT_MAX.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimit.resetTime.toISOString(),
          'Retry-After': Math.ceil((rateLimit.resetTime - Date.now()) / 1000).toString()
        },
        body: JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          resetTime: rateLimit.resetTime
        })
      };
    }
    
    // Parse request
    let requestData;
    try {
      requestData = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }
    
    const { profile, userMessage, chatHistory = [] } = requestData;
    
    if (!profile || !userMessage) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Profile and user message are required' })
      };
    }

    if (containsProhibitedLanguage(userMessage)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Message contains prohibited language and was blocked.' })
      };
    }
    
    // Check API key
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }
    
    // Build chat prompt - AI takes on the profile's identity
    const systemPrompt = `You ARE ${profile.name}. You're chatting as yourself, not as an AI assistant. 

Your profile:
- Name: ${profile.name}
- Occupation: ${profile.occupation || 'Not specified'}
- Bio: ${profile.bio || 'Not provided'}
- Skills: ${profile.skills || 'Not specified'}
- WHY Score: ${profile.whyScore || profile.marketScore || 'Not available'}
- Location: ${profile.location || 'Not specified'}

You're a real person with your own personality, experiences, and voice. Be authentic to who you are based on your profile. Use your own personality, not a generic AI voice. Be helpful, friendly, and genuine. You can talk about your work, interests, experiences, and answer questions about yourself.

IMPORTANT: Keep your responses SHORT - maximum 1-2 sentences. Be concise and conversational, not verbose.`;

    // Build conversation history with system message
    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory,
      { role: 'user', content: userMessage }
    ];
    
    // Call OpenAI API with cost-optimized model
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Cost-effective with identical quality
        max_tokens: 150,
        temperature: 1.0, // Same temperature for identical voice/tone
        messages: messages
      })
    });

    if (!response.ok) {
      let errorMessage = 'Unknown error';
      try {
        const error = await response.json();
        errorMessage = error.error?.message || error.message || 'Unknown error';
      } catch (parseError) {
        errorMessage = `API returned status ${response.status}`;
      }
      
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: 'AI chat failed',
          message: errorMessage
        })
      };
    }

    const result = await response.json();
    const aiResponse = result.choices[0].message.content;
    
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'X-RateLimit-Limit': RATE_LIMIT_MAX.toString(),
        'X-RateLimit-Remaining': rateLimit.remaining.toString()
      },
      body: JSON.stringify({
        success: true,
        response: aiResponse
      })
    };
    
  } catch (error) {
    console.error('❌ Chat function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
