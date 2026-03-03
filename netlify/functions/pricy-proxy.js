// Netlify Function to proxy Algorand API requests
// This function can access Netlify environment variables server-side

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
    // Get environment variables (only accessible server-side)
    const PRICY_URL = process.env.PRICY_URL;
    const PRICY_TOKEN = process.env.PRICY_TOKEN;

    if (!PRICY_URL) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'PRICY_URL environment variable not set' }),
      };
    }

    // Parse query parameters
    const params = new URLSearchParams(event.queryStringParameters || {});
    const target = params.get('target') || 'algod'; // 'algod' or 'indexer'
    const path = params.get('path') || '/v2/status';
    
    // Build the full URL
    const baseUrl = PRICY_URL.replace(/\/$/, ''); // Remove trailing slash
    const apiPath = path.startsWith('/') ? path : `/${path}`;
    const fullUrl = `${baseUrl}${apiPath}`;

    // Add any additional query parameters (excluding 'target' and 'path')
    const queryParams = new URLSearchParams();
    Object.keys(event.queryStringParameters || {}).forEach(key => {
      if (key !== 'target' && key !== 'path') {
        queryParams.append(key, event.queryStringParameters[key]);
      }
    });
    
    const queryString = queryParams.toString();
    const finalUrl = queryString ? `${fullUrl}?${queryString}` : fullUrl;

    // Prepare headers
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    // Add auth token if available
    if (PRICY_TOKEN) {
      headers['X-Algo-API-Token'] = PRICY_TOKEN;
    }

    // Make the request to Algorand API
    const response = await fetch(finalUrl, {
      method: event.httpMethod || 'GET',
      headers: headers,
      body: event.body || undefined,
    });

    // Get response data
    const data = await response.text();
    let jsonData;
    try {
      jsonData = JSON.parse(data);
    } catch (e) {
      jsonData = data;
    }

    // Return the response
    return {
      statusCode: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': response.headers.get('content-type') || 'application/json',
      },
      body: JSON.stringify(jsonData),
    };

  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Proxy error', 
        message: error.message 
      }),
    };
  }
};
