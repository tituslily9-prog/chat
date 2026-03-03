// Netlify Function to safely return environment variables
// Only returns non-sensitive configuration, not tokens

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: '',
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const requestedKey = body.key;

    if (!requestedKey) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Key parameter required' }),
      };
    }

    // Only allow specific keys for security
    const allowedKeys = ['PRICY_URL'];
    if (!allowedKeys.includes(requestedKey)) {
      return {
        statusCode: 403,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Key not allowed' }),
      };
    }

    // Get environment variable
    const value = process.env[requestedKey];

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        key: requestedKey,
        value: value || null,
        exists: !!value
      }),
    };

  } catch (error) {
    console.error('Get env error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Server error', 
        message: error.message 
      }),
    };
  }
};
