// Netlify Function: return allowed env vars (e.g. VAULT_URL hostname for display only)
// Never expose tokens; only allowlisted keys are returned.

exports.handler = async (event, context) => {
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

    const allowedKeys = ['VAULT_URL'];
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
        exists: !!value,
      }),
    };
  } catch (error) {
    console.error('get-env error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Server error', message: error.message }),
    };
  }
};
