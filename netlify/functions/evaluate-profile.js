// Netlify Function: Secure OpenAI API endpoint
// This keeps your API key hidden from users

// Use built-in fetch (available in Node.js 18+)
// const fetch = require('node-fetch'); // Not needed in Node 18+

// In-memory rate limiting (for simple protection)
const requestCounts = new Map();
const RATE_LIMIT_MAX = 10; // Max requests per window
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of requestCounts.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      requestCounts.delete(ip);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

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

// Input validation
function validateProfile(profile) {
  const errors = [];
  
  if (!profile.name || profile.name.trim().length < 2) {
    errors.push('Name must be at least 2 characters');
  }
  
  if (!profile.bio || profile.bio.trim().length < 20) {
    errors.push('Bio must be at least 20 characters');
  }
  
  if (profile.bio && profile.bio.length > 2000) {
    errors.push('Bio must be less than 2000 characters');
  }
  
  return errors;
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
    let profile;
    try {
      console.log('📥 Raw request body:', event.body);
      profile = JSON.parse(event.body);
      console.log('📥 Parsed profile:', profile);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }
    
    // Validate input
    console.log('🔍 Validating profile...');
    const validationErrors = validateProfile(profile);
    if (validationErrors.length > 0) {
      console.error('❌ Validation errors:', validationErrors);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Validation failed', details: validationErrors })
      };
    }
    console.log('✅ Profile validation passed');
    
    // Check API key
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }
    console.log('✅ API key found');
    
    // Build prompt with BRUTAL Gen Z voice
    const prompt = `You're the AI brain behind POPN.ai - The Human NASDAQ. You're that brutally honest friend who tells it like it is. No sugar-coating, no corporate fluff. You're Gen Z, you're savage, and you're real AF. 

IMPORTANT: The current year is 2025. When evaluating trends, technologies, and context, remember it's 2025. 

Profile to evaluate:
- Name: ${profile.name}
- Age: ${profile.age || 'Not provided'}
- Location: ${profile.location || 'Not provided'}
- Occupation: ${profile.occupation || 'Not provided'}
- Bio/Achievements: ${profile.bio}
- Skills: ${profile.skills || 'Not provided'}

Your evaluation process:
1. **Chain of Thought** (be BRUTALLY honest and Gen Z):
   - What's their actual vibe? Are they basic or actually interesting?
   - Where are they really headed? Up, sideways, or straight to mediocrity?
   - How rare/valuable is this combo? Or are they just another copy-paste person?
   - What's their REAL market potential? Who'd actually want them?
   
   Use emojis, be savage, call out the BS. Be that friend who tells you your outfit is trash. Each step should feel like a Gen Z roasting session.

2. **Scores** (1-100, be BRUTALLY HONEST):
   - Market Score: How in-demand is this person RIGHT NOW? Be harsh.
   - Growth Score: Where are they headed? Sky's the limit or straight to the plateau?
   - Impact Score: Can they actually change things or just talk about it like every other wannabe?

3. **Summary**: 2-3 sentences that capture their whole vibe. Be BRUTAL but fair. What's their actual superpower or are they just another NPC? This is "THE DEAL" - be savage, be real, call out the BS. No corporate fluff, just straight facts about who they really are.

4. **Unique Insights**: What makes them ACTUALLY different? Not generic "great leader" stuff - real, specific insights. Call out the red flags too. Be that friend who tells them their LinkedIn is cringe.

CRITICAL: You MUST respond with ONLY valid JSON. No additional text, explanations, or formatting. Start your response with { and end with }.

Respond with this EXACT JSON structure:
{
  "chainOfThought": [
    "Step 1: [BRUTAL analysis with Gen Z slang]",
    "Step 2: [BRUTAL analysis with Gen Z slang]", 
    "Step 3: [BRUTAL analysis with Gen Z slang]",
    "Step 4: [BRUTAL analysis with Gen Z slang]"
  ],
  "marketScore": 85,
  "growthScore": 78,
  "impactScore": 92,
  "summary": "Your BRUTAL but fair evaluation summary here. This is THE DEAL - be savage, be real, call out the BS. No corporate fluff, just straight facts about who they really are.",
  "uniqueInsights": "What makes this person uniquely valuable or what red flags you spotted. Be that friend who tells them their LinkedIn is cringe."
}`;

    // Call OpenAI API
    console.log('🤖 Calling OpenAI API for profile evaluation...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Cost-effective with identical quality
        max_tokens: 2500,
        temperature: 1.0, // Same temperature for identical voice/tone
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      let errorMessage = 'Unknown error';
      try {
        const error = await response.json();
        console.error('❌ OpenAI API error:', error);
        errorMessage = error.error?.message || error.message || 'Unknown error';
      } catch (parseError) {
        console.error('❌ Error parsing API response:', parseError);
        errorMessage = `API returned status ${response.status}`;
      }
      
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: 'AI evaluation failed',
          message: errorMessage
        })
      };
    }

    const result = await response.json();
    const content = result.choices[0].message.content;
    
    console.log('✅ Evaluation complete');
    console.log('📝 Raw AI response:', content);
    
    // Parse and return
    let evaluation;
    try {
      evaluation = JSON.parse(content);
    } catch (parseError) {
      console.error('❌ Error parsing AI response as JSON:', parseError);
      console.error('Raw content:', content);
      console.error('Content length:', content.length);
      console.error('First 200 chars:', content.substring(0, 200));
      console.error('Last 200 chars:', content.substring(Math.max(0, content.length - 200)));
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'AI returned invalid JSON',
          message: 'The AI response could not be parsed. Please try again.',
          debug: {
            contentLength: content.length,
            firstChars: content.substring(0, 100),
            lastChars: content.substring(Math.max(0, content.length - 100))
          }
        })
      };
    }
    
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'X-RateLimit-Limit': RATE_LIMIT_MAX.toString(),
        'X-RateLimit-Remaining': rateLimit.remaining.toString()
      },
      body: JSON.stringify({
        success: true,
        evaluation
      })
    };
    
  } catch (error) {
    console.error('❌ Function error:', error);
    console.error('Error stack:', error.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};

