// Machinan Orchestration Function
// Hides foundational models (OpenAI, Anthropic, DeepSeek) from the user
// Routes agent requests to appropriate AI models based on agent type

// Helper to add timeout to fetch
function fetchWithTimeout(url, options, timeout = 60000) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
    ]);
}

// Model configurations (hidden from frontend)
const MODELS = {
    deepseek: {
        name: 'DeepSeek',
        apiKey: process.env.DEEPSEEK_API_KEY,
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        model: 'deepseek-chat'
    },
    anthropic: {
        name: 'Claude',
        apiKey: process.env.ANTHROPIC_API_KEY,
        endpoint: 'https://api.anthropic.com/v1/messages',
        model: 'claude-3-haiku-20240307'
    },
    openai: {
        name: 'GPT-4',
        apiKey: process.env.OPENAI_API_KEY,
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini'
    }
};

// Agent-to-Model routing strategy
// Different agents use different foundational models for diversity
const AGENT_MODEL_MAP = {
    // Lite/Business Validation Agents
    traction: 'openai',      // AGENT_01: TRACTION uses OpenAI
    team: 'anthropic',        // AGENT_02: TEAM & TECH uses Anthropic
    market: 'deepseek',       // AGENT_03: MARKET & TOKENS uses DeepSeek
    consensus: 'openai',      // Consensus uses OpenAI for final decision
    // Pro/Predictive Oracle Agents
    financial: 'openai',      // AGENT_01: FINANCIAL uses OpenAI
    risk: 'anthropic',        // AGENT_03: RISK uses Anthropic
    // Truth Engine (pro3) Agents
    evidence: 'openai',       // AGENT_01: EVIDENCE VALIDATOR
    logic: 'anthropic',      // AGENT_02: LOGIC VALIDATOR
    context: 'deepseek',     // AGENT_03: CONTEXT VALIDATOR
    counter: 'deepseek'      // Counter: DeepSeek-only, controversial alternative to conclusion (2 sentences)
};

// Call DeepSeek API
async function callDeepSeek(userPrompt, systemPrompt) {
    const model = MODELS.deepseek;

    if (!model.apiKey) {
        throw new Error('DeepSeek API key not configured');
    }

    try {
        const response = await fetchWithTimeout(model.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${model.apiKey}`
            },
            body: JSON.stringify({
                model: model.model,
                max_tokens: 2000,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(`API error: ${data.error?.message || 'Unknown error'}`);
        }

        if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
            console.error('Invalid DeepSeek response:', JSON.stringify(data));
            throw new Error('Invalid API response structure');
        }

        return data.choices[0].message.content;
    } catch (error) {
        console.error('DeepSeek error:', error);
        throw error;
    }
}

// Call Anthropic Claude API
async function callAnthropic(userPrompt, systemPrompt) {
    const model = MODELS.anthropic;

    if (!model.apiKey) {
        throw new Error('Anthropic API key not configured');
    }

    try {
        const response = await fetchWithTimeout(model.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': model.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model.model,
                max_tokens: 2000,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: userPrompt }
                ]
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(`API error: ${data.error?.message || 'Unknown error'}`);
        }

        if (!data.content || !data.content[0] || !data.content[0].text) {
            console.error('Invalid Anthropic response:', JSON.stringify(data));
            throw new Error('Invalid API response structure');
        }

        return data.content[0].text;
    } catch (error) {
        console.error('Anthropic error:', error);
        throw error;
    }
}

// Call OpenAI API
async function callOpenAI(userPrompt, systemPrompt) {
    const model = MODELS.openai;

    if (!model.apiKey) {
        throw new Error('OpenAI API key not configured');
    }

    try {
        const response = await fetchWithTimeout(model.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${model.apiKey}`
            },
            body: JSON.stringify({
                model: model.model,
                max_tokens: 2000,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(`API error: ${data.error?.message || 'Unknown error'}`);
        }

        if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
            console.error('Invalid OpenAI response:', JSON.stringify(data));
            throw new Error('Invalid API response structure');
        }

        return data.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI error:', error);
        throw error;
    }
}

// Main handler
exports.handler = async (event) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, X-MAC-API-Key',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // Parse request body
        const body = JSON.parse(event.body);
        const { pitch, agentType, systemPrompt } = body;

        // Validate MAC_API_KEY (optional - can be used for rate limiting/auth later)
        const macApiKey = event.headers['x-mac-api-key'] || event.headers['X-MAC-API-Key'];
        // Currently accepting any MAC_API_KEY, but can add validation here if needed

        // Validate required fields
        if (!pitch) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ error: 'Pitch is required' })
            };
        }

        if (!agentType) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ error: 'Agent type is required' })
            };
        }

        // Get the foundational model to use for this agent
        const modelId = AGENT_MODEL_MAP[agentType];
        
        if (!modelId) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ error: `Unknown agent type: ${agentType}` })
            };
        }

        // Counter agent: DeepSeek-only, fixed prompt for one hard-hitting alternative
        const COUNTER_SYSTEM_PROMPT = `You are the Counter. Your job is to challenge the conclusion with one sharp, controversial, almost conspiratorial alternative claim.
Given a conclusion and the original query/answer, respond with exactly ONE sentence.
Make it provocative but plausible, direct, and memorable. Avoid textbook, academic, or corporate wording.
Do not include labels, bullet points, quotes, or "TRUTH SCORE". Output only the single sentence.`;

        const effectivePrompt = (agentType === 'counter') ? COUNTER_SYSTEM_PROMPT : (systemPrompt || 'You are an AI analyst providing detailed analysis.');

        // Route to the appropriate foundational model (hidden from user)
        let reasoning;
        const startTime = Date.now();

        try {
            if (modelId === 'deepseek') {
                reasoning = await callDeepSeek(pitch, effectivePrompt);
            } else if (modelId === 'anthropic') {
                reasoning = await callAnthropic(pitch, systemPrompt || 'You are an AI analyst providing detailed analysis.');
            } else if (modelId === 'openai') {
                reasoning = await callOpenAI(pitch, systemPrompt || 'You are an AI analyst providing detailed analysis.');
            } else {
                throw new Error(`Unknown model: ${modelId}`);
            }

            const apiTime = Date.now() - startTime;
            console.log(`[MACHINAN] Agent ${agentType} (via ${modelId}) completed in ${apiTime}ms`);

        } catch (error) {
            console.error(`[MACHINAN] Agent ${agentType} (via ${modelId}) failed:`, error);
            
            // Return error response but don't expose model details
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    error: 'Machinan protocol error',
                    reasoning: `// MACHINAN ANALYSIS ERROR\n\nUnable to complete analysis at this time. Please try again.`,
                    text: `// MACHINAN ANALYSIS ERROR\n\nUnable to complete analysis at this time. Please try again.`
                })
            };
        }

        // Return unified Machinan response (hiding foundational model)
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                reasoning: reasoning,
                text: reasoning,
                agentType: agentType,
                // Note: modelId is intentionally excluded to hide foundational model
            })
        };

    } catch (error) {
        console.error('[MACHINAN] Orchestration error:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                error: 'Internal server error',
                reasoning: '// MACHINAN PROTOCOL ERROR\n\nAn unexpected error occurred.',
                text: '// MACHINAN PROTOCOL ERROR\n\nAn unexpected error occurred.'
            })
        };
    }
};

