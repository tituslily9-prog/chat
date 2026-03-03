// Netlify Function: Reality Warp - AI-Powered Game World Modification
// Uses OpenAI to interpret player prompts and generate game configuration changes

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
    let requestData;
    try {
      requestData = JSON.parse(event.body);
    } catch (parseError) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { prompt } = requestData;

    if (!prompt || typeof prompt !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Prompt required' }) };
    }
    const trimmed = prompt.trim();
    if (trimmed.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Prompt required' }) };
    }
    const PROMPT_MAX_LENGTH = 500;
    const promptToUse = trimmed.length > PROMPT_MAX_LENGTH ? trimmed.slice(0, PROMPT_MAX_LENGTH) : trimmed;

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
    }

    const systemPrompt = `You power "Reality Warp" for a polar bear racing game. Update scenery only (no redirects). Output ONLY raw JSON, no markdown.

EXACT JSON FORMAT (decimal integers for colors, NOT hex):
{"fogColor":16724736,"skyColor":3342336,"baseMoveSpeedMultiplier":1.2,"obstacleSpeedMultiplier":1.3,"weather":"clear","dialogues":["Director: Fire Protocol initiated...","The world burns!","Heat rising!","Flames everywhere!","Maximum heat!"]}

OPTIONAL: "bikeColor", "bodyColor" (decimal), "gameName" (string). e.g. "lion" → bodyColor 16753920, bikeColor 9342606, gameName "Lion Run".

COLORS (decimals): Fire 16724736,3342336 | Neon 16711935,655386 | Space 34,17 | Sunset 16746564,16737843 | Lion 16753920,9342606 | Ice 11198207,13690096 | Storm 2236979,1118498

RULES: baseMoveSpeedMultiplier 0.3-2.0; obstacleSpeedMultiplier 0.3-2.5; weather "clear"|"rain"|"storm"; dialogues 5 strings, first "Director: ...". Be creative!`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 400,
        temperature: 0.8,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptToUse }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('OpenAI API error:', error);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: 'AI unavailable', message: error.error?.message })
      };
    }

    const result = await response.json();
    const content = result.choices[0].message.content;

    // Parse and validate the JSON response
    let config;
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        // Clean up common issues: convert hex strings to numbers
        let jsonStr = jsonMatch[0];
        
        // Handle hex values that might be strings like "0xff0000" -> convert to number
        jsonStr = jsonStr.replace(/"(0x[0-9a-fA-F]+)"/g, (match, hex) => {
          return parseInt(hex, 16).toString();
        });
        
        // Handle hex values without quotes that JS won't parse
        jsonStr = jsonStr.replace(/:\s*(0x[0-9a-fA-F]+)/g, (match, hex) => {
          return ': ' + parseInt(hex, 16).toString();
        });
        
        config = JSON.parse(jsonStr);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Reality Warp: Failed to parse AI response');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Invalid AI response format' })
      };
    }

    // Convert string hex values to numbers if needed
    if (typeof config.fogColor === 'string' && config.fogColor.startsWith('0x')) {
      config.fogColor = parseInt(config.fogColor, 16);
    }
    if (typeof config.skyColor === 'string' && config.skyColor.startsWith('0x')) {
      config.skyColor = parseInt(config.skyColor, 16);
    }

    // Provide defaults for missing fields
    if (typeof config.fogColor !== 'number') {
      config.fogColor = 0x4488ff; // Default blue fog
    }
    if (typeof config.skyColor !== 'number') {
      config.skyColor = 0x112244; // Default dark blue sky
    }
    if (typeof config.baseMoveSpeedMultiplier !== 'number') {
      config.baseMoveSpeedMultiplier = 1.0;
    }
    if (typeof config.obstacleSpeedMultiplier !== 'number') {
      config.obstacleSpeedMultiplier = 1.0;
    }
    if (!['clear', 'rain', 'storm'].includes(config.weather)) {
      config.weather = 'clear';
    }
    if (!Array.isArray(config.dialogues) || config.dialogues.length === 0) {
      config.dialogues = [
        "Director: Reality shift initiated...",
        "The world transforms around you!",
        "New parameters locked in!",
        "Feel the change!",
        "Adaptation complete!"
      ];
    }

    // Optional: bikeColor, bodyColor (decimals), gameName
    if (typeof config.bikeColor === 'string' && config.bikeColor.startsWith('0x')) {
      config.bikeColor = parseInt(config.bikeColor, 16);
    }
    if (typeof config.bodyColor === 'string' && config.bodyColor.startsWith('0x')) {
      config.bodyColor = parseInt(config.bodyColor, 16);
    }

    // Clamp values to safe ranges
    config.baseMoveSpeedMultiplier = Math.max(0.3, Math.min(2.0, config.baseMoveSpeedMultiplier));
    config.obstacleSpeedMultiplier = Math.max(0.3, Math.min(2.5, config.obstacleSpeedMultiplier));

    // Sanitize strings for prod (length, no control chars)
    const truncate = (s, max) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');
    if (config.gameName != null) config.gameName = truncate(String(config.gameName), 60);
    if (Array.isArray(config.dialogues)) {
      config.dialogues = config.dialogues.map((d) => truncate(String(d), 200)).filter(Boolean);
      if (config.dialogues.length === 0) {
        config.dialogues = ["Director: Reality shift initiated.", "The world transforms!", "New parameters locked in!", "Feel the change!", "Adaptation complete!"];
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        config
      })
    };

  } catch (error) {
    console.error('Reality Warp error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Warp malfunction' })
    };
  }
};
