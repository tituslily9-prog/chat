// Netlify Function: 3-Step AI Search Chain
// Step 1: OpenAI API → Initial response
// Step 2: OpenAI GPT-4o Mini → Challenge the OpenAI response
// Step 3: Deepseek API → Process challenge and produce final result

// Helper to add timeout to fetch
function fetchWithTimeout(url, options, timeout = 30000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    )
  ]);
}

// Rate limiting
const requestCounts = new Map();
const RATE_LIMIT_MAX = 20; // Max requests per window
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms

setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of requestCounts.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      requestCounts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

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
    
    const query = requestData.query;
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query is required and must be a non-empty string' })
      };
    }
    
    // Check API keys
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    
    console.log('🔑 API Key Status:', {
      hasOpenAI: !!OPENAI_API_KEY,
      hasDeepseek: !!DEEPSEEK_API_KEY,
      openAIKeyLength: OPENAI_API_KEY ? OPENAI_API_KEY.length : 0,
      deepseekKeyLength: DEEPSEEK_API_KEY ? DEEPSEEK_API_KEY.length : 0
    });
    
    if (!OPENAI_API_KEY || !DEEPSEEK_API_KEY) {
      console.error('❌ Missing API keys:', {
        hasOpenAI: !!OPENAI_API_KEY,
        hasDeepseek: !!DEEPSEEK_API_KEY
      });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Server configuration error: API keys not configured',
          details: {
            missingOpenAI: !OPENAI_API_KEY,
            missingDeepseek: !DEEPSEEK_API_KEY
          }
        })
      };
    }
    
    console.log('🔍 Starting 3-step AI search chain for query:', query);
    
    // Step 1: OpenAI API - Initial response
    console.log('📝 Step 1: Calling OpenAI API...');
    const openaiPrompt = `You are a helpful AI assistant. Please provide a comprehensive, well-researched answer to the following query. Be thorough and accurate.\n\nQuery: ${query}`;
    
    const openaiResponse = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 250,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: openaiPrompt
        }]
      })
    }, 30000);
    
    if (!openaiResponse.ok) {
      const error = await openaiResponse.json().catch(() => ({ error: { message: 'Unknown error' } }));
      console.error('❌ OpenAI API error:', error);
      return {
        statusCode: openaiResponse.status,
        headers,
        body: JSON.stringify({ 
          error: 'OpenAI API call failed',
          message: error.error?.message || 'Unknown error'
        })
      };
    }
    
    const openaiResult = await openaiResponse.json();
    const openaiAnswer = openaiResult.choices[0].message.content;
    console.log('✅ Step 1 complete - OpenAI response received');
    
    // Step 2: OpenAI GPT-4o Mini - Challenge the OpenAI response
    console.log('🔍 Step 2: Calling OpenAI API to challenge the response...');
    const challengePrompt = `You are a critical AI evaluator. The following is an answer provided by another AI system to a user's query. Your task is to critically analyze this answer, identify any weaknesses, inaccuracies, biases, or areas that need improvement. Be thorough and constructive in your critique.\n\nOriginal Query: ${query}\n\nAI Answer to Critique:\n${openaiAnswer}\n\nProvide a detailed critical analysis that challenges the answer where necessary and highlights both strengths and weaknesses.`;
    
    let challengeResponse;
    try {
      const challengeApiResponse = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 250,
          messages: [{
            role: 'user',
            content: challengePrompt
          }]
        })
      }, 30000); // 30 second timeout
      
      const challengeResult = await challengeApiResponse.json();
      
      if (!challengeApiResponse.ok) {
        console.error('❌ OpenAI API error:', challengeResult);
        throw new Error(`OpenAI API error: ${challengeResult.error?.message || 'Unknown error'}`);
      }
      
      // Handle OpenAI response format
      if (!challengeResult.choices || !challengeResult.choices[0] || !challengeResult.choices[0].message) {
        console.error('❌ Invalid OpenAI response structure:', JSON.stringify(challengeResult));
        throw new Error('Invalid API response structure from OpenAI');
      }
      
      challengeResponse = challengeResult.choices[0].message.content;
      console.log('✅ Step 2 complete - Challenge received');
      
    } catch (error) {
      console.error('❌ OpenAI API call failed:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'OpenAI API call failed',
          message: error.message || 'Unknown error'
        })
      };
    }
    
    // Step 3: Deepseek API - Process challenge and produce final result
    console.log('🎯 Step 3: Calling Deepseek API to synthesize final answer...');
    const deepseekPrompt = `You are a final synthesis AI. You have received:
1. An original user query
2. An initial answer from another AI system
3. A critical analysis that challenges the initial answer

Your task is to synthesize all of this information to produce the BEST possible final answer. Consider the original answer, the critiques, and create a refined, accurate, and comprehensive response.

Original Query: ${query}

Initial AI Answer:
${openaiAnswer}

Critical Analysis and Challenges:
${challengeResponse}

Now provide the final, refined answer that addresses the original query while incorporating insights from both the initial answer and the critical analysis.`;
    
    const deepseekResponse = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 250,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: deepseekPrompt
        }]
      })
    }, 30000);
    
    if (!deepseekResponse.ok) {
      const error = await deepseekResponse.json().catch(() => ({ error: { message: 'Unknown error' } }));
      console.error('❌ Deepseek API error:', error);
      return {
        statusCode: deepseekResponse.status,
        headers,
        body: JSON.stringify({ 
          error: 'Deepseek API call failed',
          message: error.error?.message || 'Unknown error'
        })
      };
    }
    
    const deepseekResult = await deepseekResponse.json();
    const finalAnswer = deepseekResult.choices[0].message.content;
    console.log('✅ Step 3 complete - Final answer synthesized');
    
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'X-RateLimit-Limit': RATE_LIMIT_MAX.toString(),
        'X-RateLimit-Remaining': rateLimit.remaining.toString()
      },
      body: JSON.stringify({
        success: true,
        query: query,
        answer: finalAnswer,
        steps: {
          step1_openai: openaiAnswer,
          step2_challenge: challengeResponse,
          step3_deepseek_final: finalAnswer
        }
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

