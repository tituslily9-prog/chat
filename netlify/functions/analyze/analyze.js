const crypto = require('crypto');

// Helper to add timeout to fetch
function fetchWithTimeout(url, options, timeout = 30000) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
    ]);
}

// Model configurations
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

// Build context-aware prompt
function buildPromptWithContext(contractText, modelId, cycle, priorTraces, peerReasoning) {
    let prompt = `You are analyzing a contract as part of a jury deliberation.\n\nCONTRACT:\n${contractText}\n\n`;
    
    // If cycle 2+, show what this model said before
    if (priorTraces && priorTraces[modelId]) {
        prompt += `YOUR PREVIOUS ANALYSIS (Cycle ${cycle - 1}):\n${priorTraces[modelId].reasoning}\n\n`;
    }
    
    // If other models have analyzed in this cycle, show their reasoning
    if (peerReasoning && Object.keys(peerReasoning).length > 0) {
        for (const [peer, reasoning] of Object.entries(peerReasoning)) {
            prompt += `${peer.toUpperCase()}'S ANALYSIS:\n${reasoning}\n\n`;
        }
    }
    
    // Add appropriate instructions based on context
    if (cycle === 1 && !peerReasoning) {
        prompt += 'INSTRUCTIONS:\nAnalyze this contract independently. Focus on risk areas, unusual clauses, and provide specific recommendations.\n';
    } else if (peerReasoning) {
        prompt += 'INSTRUCTIONS:\nYour peers have analyzed this. Where do you AGREE? Where do you DISAGREE? Explain your reasoning.\n';
    } else {
        prompt += 'INSTRUCTIONS:\nRefine your previous analysis. Were you wrong about anything? What did you miss?\n';
    }
    
    prompt += 'Respond in JSON format:\n{\n  "reasoning": "your analysis",\n  "confidence": 85\n}';
    
    return prompt;
}

// Generate cryptographic commitment
function generateCommitment(output, reasoning) {
    const data = JSON.stringify({ output, reasoning, timestamp: Date.now() });
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return hash;
}

// Call DeepSeek API
async function callDeepSeek(userPrompt, previousOutputs = []) {
    const model = MODELS.deepseek;

    try {
        const response = await fetchWithTimeout(model.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${model.apiKey}`
            },
            body: JSON.stringify({
                model: model.model,
                max_tokens: 500,
                messages: [
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

        const reasoning = data.choices[0].message.content;
        const commitment = generateCommitment(reasoning, reasoning);
        return { reasoning, commitment, confidence: calculateConfidence(reasoning) };
    } catch (error) {
        console.error('DeepSeek error:', error);
        throw error;
    }
}

// Call Anthropic Claude API
async function callAnthropic(userPrompt, previousOutputs = []) {
    const model = MODELS.anthropic;

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
                max_tokens: 500,
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

        const reasoning = data.content[0].text;
        const commitment = generateCommitment(reasoning, reasoning);
        return { reasoning, commitment, confidence: calculateConfidence(reasoning) };
    } catch (error) {
        console.error('Anthropic error:', error);
        throw error;
    }
}

// Call OpenAI API
async function callOpenAI(userPrompt, previousOutputs = []) {
    const model = MODELS.openai;

    try {
        const response = await fetchWithTimeout(model.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${model.apiKey}`
            },
            body: JSON.stringify({
                model: model.model,
                max_tokens: 500,
                messages: [
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

        const reasoning = data.choices[0].message.content;
        const commitment = generateCommitment(reasoning, reasoning);
        return { reasoning, commitment, confidence: calculateConfidence(reasoning) };
    } catch (error) {
        console.error('OpenAI error:', error);
        throw error;
    }
}

// Calculate confidence score from reasoning
function calculateConfidence(reasoning) {
    // Extract recommendation and assess confidence
    const lower = reasoning.toLowerCase();
    let confidence = 70;
    
    if (lower.includes('high confidence') || lower.includes('clear recommendation')) {
        confidence = 95;
    } else if (lower.includes('moderate') || lower.includes('reasonable')) {
        confidence = 80;
    } else if (lower.includes('uncertain') || lower.includes('questionable')) {
        confidence = 60;
    }
    
    // Add some randomness based on reasoning length (more detailed = higher confidence)
    const lengthBonus = Math.min(reasoning.length / 1000 * 10, 20);
    return Math.min(95, confidence + lengthBonus);
}

// Calculate median
function calculateMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Calculate Median Absolute Deviation (MAD)
function calculateMAD(values, median) {
    const deviations = values.map(v => Math.abs(v - median));
    return calculateMedian(deviations);
}

// Detect outliers using MAD
function detectOutliers(confidences, threshold = 2) {
    const median = calculateMedian(confidences);
    const mad = calculateMAD(confidences, median);
    const outlierIndices = [];
    
    confidences.forEach((conf, idx) => {
        const distance = Math.abs(conf - median);
        if (distance > threshold * mad && mad > 0) {
            outlierIndices.push(idx);
        }
    });
    
    return outlierIndices;
}

// Main handler
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { contractText, cycle, modelId, priorCycleTraces, peerReasoning } = JSON.parse(event.body);

        if (!contractText) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Contract text required' })
            };
        }

        if (!modelId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Model ID required' })
            };
        }

        // Build context-aware prompt  
        const userPrompt = buildPromptWithContext(contractText, modelId, cycle || 1, priorCycleTraces, peerReasoning);
        
        // Call the specified model
        const results = {};
        const errors = {};
        const startTime = Date.now();
        
        try {
            let result;
            if (modelId === 'deepseek') {
                result = await callDeepSeek(userPrompt, []);
            } else if (modelId === 'anthropic') {
                result = await callAnthropic(userPrompt, []);
            } else if (modelId === 'openai') {
                result = await callOpenAI(userPrompt, []);
            } else {
                throw new Error(`Unknown model: ${modelId}`);
            }
            
            results[modelId] = result;
            const apiTime = Date.now() - startTime;
            console.log(`Model ${modelId} completed in ${apiTime}ms`);
            
        } catch (error) {
            console.error(`${modelId} failed:`, error);
            errors[modelId] = error.message || 'API error';
            results[modelId] = { reasoning: 'Analysis unavailable', commitment: '', confidence: 0 };
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                cycle: cycle || 1,
                results
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
