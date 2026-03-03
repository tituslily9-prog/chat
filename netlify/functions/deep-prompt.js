// Netlify Function: Deep Prompting Engine
// Multi-iteration self-refinement system that improves LLM responses through critique loops
//
// Optimized for speed (fastest/cheapest models):
// - Model: gpt-4o-mini (cost-effective and high quality)
// - Token limits: 300 for responses, 50 for quality eval, 300 for synthesis
// - Truncated prompts: responses limited to 200-300 chars
// - Default maxIterations: 2 (power is in iterations, not model size)
// - Minimal prompts: ultra-compressed templates
// - Skip quality eval on intermediate iterations (only final)

// In-memory cache for query deduplication
const queryCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// In-memory rate limiting
const requestCounts = new Map();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

// Clean up old cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of queryCache.entries()) {
    if (now - data.timestamp > CACHE_TTL) {
      queryCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Clean up old rate limit entries
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

// Generate cache key from query
function getCacheKey(query, maxIterations, qualityThreshold) {
  return `${query.toLowerCase().trim()}_${maxIterations}_${qualityThreshold}`;
}

// Call OpenAI API - Using gpt-4o-mini (cost-effective and high quality)
async function callOpenAI(messages, model = 'gpt-4o-mini', temperature = 0.7, maxTokens = 300) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const result = await response.json();
  return result.choices[0].message.content;
}

// Evaluate quality score (0-1) - only called when needed to save time
async function evaluateQuality(response, query, iteration, temperature) {
  // Truncate response if too long to save tokens (reduced to 200 chars)
  const truncatedResponse = response.length > 200 ? response.substring(0, 200) + '...' : response;
  
  const evaluationPrompt = `Q:"${query}" R:${truncatedResponse} Rate 0-1. JSON:{"score":0.85}`;

  try {
    const evaluation = await callOpenAI(
      [{ role: 'user', content: evaluationPrompt }],
      'gpt-4o-mini',
      temperature,
      50
    );
    
    const parsed = JSON.parse(evaluation);
    return {
      score: Math.min(1.0, Math.max(0.0, parseFloat(parsed.score) || 0.5)),
      reasoning: parsed.reasoning || 'No reasoning provided'
    };
  } catch (error) {
    console.error('Quality evaluation error:', error);
    // Default to moderate score if evaluation fails
    return { score: 0.6, reasoning: 'Evaluation failed, defaulting to moderate score' };
  }
}

// Generate critique and improvement prompt - ultra-compressed
function generateCritiquePrompt(query, lastOutput, iteration) {
  // Truncate last output if too long to save tokens (reduced to 300 chars)
  const truncatedOutput = lastOutput.length > 300 ? lastOutput.substring(0, 300) + '...' : lastOutput;
  
  return `Q:"${query}" P:${truncatedOutput} Improve. JSON:{"improved":"answer","changes":"what changed"}`;
}

// Main deep prompting function
async function deepPrompt(query, options = {}) {
  const {
    maxIterations = 2, // Reduced to 2 for speed (power is in iterations, not model size)
    qualityThreshold = 0.9,
    useStrongModelForFinal = false,
    initialTemperature = 0.9,
    finalTemperature = 0.3
  } = options;

  const iterations = [];
  let currentResponse = '';
  let currentQuality = 0;
  let iteration = 0;

  // Initial query
  const initialMessages = [{
    role: 'user',
    content: query
  }];

  // Calculate temperature for this iteration (decay from initial to final)
  const getTemperature = (iter) => {
    if (maxIterations === 1) return finalTemperature;
    const progress = iter / (maxIterations - 1);
    return initialTemperature - (initialTemperature - finalTemperature) * progress;
  };

  // First iteration - skip quality eval to save time
  iteration++;
  const temp1 = getTemperature(0);
  currentResponse = await callOpenAI(initialMessages, 'gpt-4o-mini', temp1, 300);
  // Skip quality evaluation on first iteration to save time
  currentQuality = 0.7; // Default moderate quality

  iterations.push({
    iteration,
    response: currentResponse,
    quality: currentQuality,
    qualityReasoning: 'Initial response - quality not evaluated',
    temperature: temp1,
    model: 'gpt-4o-mini',
    changes: 'Initial response'
  });

  // Refinement loop
  while (iteration < maxIterations && currentQuality < qualityThreshold) {
    iteration++;
    const temp = getTemperature(iteration - 1);
    
    // Generate critique and improvement
    const critiquePrompt = generateCritiquePrompt(query, currentResponse, iteration - 1);
    const critiqueResponse = await callOpenAI(
      [{ role: 'user', content: critiquePrompt }],
      'gpt-4o-mini',
      temp,
      300
    );

    let critiqueData;
    try {
      critiqueData = JSON.parse(critiqueResponse);
    } catch (error) {
      // If JSON parsing fails, use response as-is
      critiqueData = {
        improved: critiqueResponse,
        changes: 'Refined response'
      };
    }

    currentResponse = critiqueData.improved || critiqueResponse;
    
    // Only evaluate quality on final iteration to save time
    if (iteration >= maxIterations || currentQuality >= qualityThreshold) {
      const quality = await evaluateQuality(currentResponse, query, iteration, temp);
      currentQuality = quality.score;
    } else {
      // Estimate quality improvement without full eval
      currentQuality = Math.min(0.95, iterations[iterations.length - 1].quality + 0.1);
    }

    iterations.push({
      iteration,
      response: currentResponse,
      quality: currentQuality,
      qualityReasoning: iteration >= maxIterations ? 'Final quality evaluation' : 'Estimated improvement',
      temperature: temp,
      model: 'gpt-4o-mini',
      changes: critiqueData.changes || 'Refined based on self-critique',
      previousQuality: iterations[iterations.length - 1].quality
    });

    // If quality improved significantly, we can consider early stopping
    if (currentQuality >= qualityThreshold) {
      break;
    }
  }

  // Optional: Final synthesis - using gpt-4o-mini
  let finalResponse = currentResponse;
  if (useStrongModelForFinal && iterations.length > 1) {
    // Truncate each iteration response to save tokens (reduced to 150 chars)
    const iterationSummaries = iterations.map((iter, idx) => {
      const truncated = iter.response.length > 150 ? iter.response.substring(0, 150) + '...' : iter.response;
      return `I${iter.iteration}:${truncated}`;
    }).join('|');
    
    const synthesisPrompt = `Q:"${query}" Iters:${iterationSummaries} Best answer. JSON:{"answer":"response"}`;

    try {
      const synthesisResult = await callOpenAI(
        [{ role: 'user', content: synthesisPrompt }],
        'gpt-4o-mini', // Keep using fast model
        finalTemperature,
        300
      );
      
      // Try to extract JSON if present, otherwise use as-is
      try {
        const parsed = JSON.parse(synthesisResult);
        finalResponse = parsed.answer || synthesisResult;
      } catch {
        finalResponse = synthesisResult;
      }
      
      const finalQuality = await evaluateQuality(finalResponse, query, 'final', finalTemperature);
      
      iterations.push({
        iteration: iterations.length + 1,
        response: finalResponse,
        quality: finalQuality.score,
        qualityReasoning: finalQuality.reasoning,
        temperature: finalTemperature,
        model: 'gpt-4o-mini',
        changes: 'Final synthesis',
        previousQuality: currentQuality
      });
    } catch (error) {
      console.error('Final synthesis failed, using last iteration:', error);
      // Fall back to last iteration if synthesis fails
    }
  }

  return {
    query,
    finalResponse: finalResponse,
    iterations,
    finalQuality: iterations[iterations.length - 1].quality,
    totalIterations: iterations.length,
    converged: currentQuality >= qualityThreshold || iteration >= maxIterations
  };
}

// Main handler
exports.handler = async (event, context) => {
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

    const { query, maxIterations = 2, qualityThreshold = 0.9, useStrongModelForFinal = false } = requestData;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query is required and must be a non-empty string' })
      };
    }

    // Check cache
    const cacheKey = getCacheKey(query, maxIterations, qualityThreshold);
    const cached = queryCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'X-Cache': 'HIT'
        },
        body: JSON.stringify({
          ...cached.data,
          cached: true
        })
      };
    }

    // Run deep prompting
    const result = await deepPrompt(query, {
      maxIterations: Math.min(Math.max(1, parseInt(maxIterations) || 2), 5), // Cap at 5, default 2 for speed
      qualityThreshold: Math.min(Math.max(0.1, parseFloat(qualityThreshold) || 0.9), 1.0),
      useStrongModelForFinal: useStrongModelForFinal === true,
      initialTemperature: 0.9,
      finalTemperature: 0.3
    });

    // Cache result
    queryCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'X-Cache': 'MISS'
      },
      body: JSON.stringify({
        ...result,
        cached: false
      })
    };

  } catch (error) {
    console.error('Deep prompt error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Deep prompting failed',
        message: error.message
      })
    };
  }
};

