// Netlify Function: proxy for Algorand/L1 (same as ockams-proxy; app.html sends via this name)
// Uses VAULT_URL and VAULT_TOKEN from Netlify environment variables

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
    const VAULT_URL = process.env.VAULT_URL;
    const VAULT_TOKEN = process.env.VAULT_TOKEN;

    if (!VAULT_URL) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'VAULT_URL environment variable not set' }),
      };
    }

    const rawParams = event.queryStringParameters || {};
    const params = new URLSearchParams(rawParams);
    const rawPath = params.get('path') || '/v2/status';
    const path = rawPath.includes('%') ? decodeURIComponent(rawPath) : rawPath;

    const baseUrl = VAULT_URL.replace(/\/$/, '');
    const apiPath = path.startsWith('/') ? path : `/${path}`;
    const fullUrl = `${baseUrl}${apiPath}`;

    const queryParams = new URLSearchParams();
    Object.keys(event.queryStringParameters || {}).forEach(key => {
      if (key !== 'target' && key !== 'path') {
        queryParams.append(key, event.queryStringParameters[key]);
      }
    });
    const queryString = queryParams.toString();
    const finalUrl = queryString ? `${fullUrl}?${queryString}` : fullUrl;

    const isPost = (event.httpMethod || 'GET').toUpperCase() === 'POST';
    const isTransactionPath = path === '/v2/transactions' || path.replace(/\/$/, '') === '/v2/transactions';
    const isTransactionPost = isPost && isTransactionPath && event.body;
    let body = event.body || undefined;
    if (isTransactionPost && event.body) {
      try {
        let base64Str = typeof event.body === 'string' ? event.body : String(event.body);
        if (event.isBase64Encoded) {
          base64Str = Buffer.from(base64Str, 'base64').toString('utf8');
        }
        base64Str = base64Str.trim();
        body = Buffer.from(base64Str, 'base64');
        if (body.length === 0) throw new Error('Decoded body is empty');
      } catch (err) {
        return {
          statusCode: 400,
          headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid base64 transaction body', message: (err && err.message) || String(err) }),
        };
      }
    }

    const contentType = (event.httpMethod || 'GET').toUpperCase() === 'POST' && body
      ? (isTransactionPost ? 'application/x-binary' : (event.headers['content-type'] || event.headers['Content-Type'] || 'application/json'))
      : 'application/json';
    const headers = {
      'Accept': 'application/json',
      'Content-Type': contentType,
    };
    if (VAULT_TOKEN) {
      headers['X-Algo-API-Token'] = VAULT_TOKEN;
    }

    const response = await fetch(finalUrl, {
      method: event.httpMethod || 'GET',
      headers: headers,
      body: body,
    });

    const data = await response.text();
    let jsonData;
    try {
      jsonData = JSON.parse(data);
    } catch (e) {
      jsonData = data;
    }

    return {
      statusCode: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': response.headers.get('content-type') || 'application/json',
      },
      body: typeof jsonData === 'object' ? JSON.stringify(jsonData) : JSON.stringify({ raw: jsonData }),
    };
  } catch (error) {
    console.error('OMNIBRANE-proxy error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Proxy error', message: error.message }),
    };
  }
};
