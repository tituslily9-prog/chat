const ALLOWED_TARGETS = new Set(['algod', 'indexer']);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
};

const TARGET_CONFIG = {
  algod: {
    url: process.env.RAZROS_ALGOD_URL || process.env.ALGOD_URL || '',
    token: process.env.RAZROS_ALGOD_TOKEN || process.env.ALGOD_TOKEN || '',
    header: 'X-Algo-API-Token'
  },
  indexer: {
    url: process.env.RAZROS_INDEXER_URL || process.env.INDEXER_URL || '',
    token: process.env.RAZROS_INDEXER_TOKEN || process.env.INDEXER_TOKEN || '',
    header: 'X-Indexer-API-Token'
  }
};

const buildSearchParams = (event) => {
  const params = new URLSearchParams();

  if (event.multiValueQueryStringParameters) {
    for (const [key, values] of Object.entries(event.multiValueQueryStringParameters)) {
      if (!Array.isArray(values)) continue;
      values.forEach((value) => {
        if (value !== undefined && value !== null) {
          params.append(key, value);
        }
      });
    }
  } else if (event.queryStringParameters) {
    for (const [key, value] of Object.entries(event.queryStringParameters)) {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    }
  }

  return params;
};

const resolveBaseUrl = (target, overrides) => {
  if (overrides.has('url')) {
    const url = overrides.get('url');
    overrides.delete('url');
    return url;
  }

  const config = TARGET_CONFIG[target] || {};
  return config.url;
};

const sanitizePath = (rawPath) => {
  if (!rawPath || rawPath === '/') return '/';
  try {
    const decoded = decodeURIComponent(rawPath);
    return decoded.startsWith('/') ? decoded : `/${decoded}`;
  } catch {
    return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  }
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const searchParams = buildSearchParams(event);
  const target = (searchParams.get('target') || '').toLowerCase();
  const rawPath = searchParams.get('path') || '/';

  searchParams.delete('target');
  searchParams.delete('path');

  if (!ALLOWED_TARGETS.has(target)) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid target', target })
    };
  }

  const baseUrl = resolveBaseUrl(target, searchParams);
  if (!baseUrl) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: `Missing base URL for ${target}` })
    };
  }

  const path = sanitizePath(rawPath);
  const upstreamUrl = new URL(path, baseUrl);

  for (const [key, value] of searchParams.entries()) {
    upstreamUrl.searchParams.append(key, value);
  }

  const targetConfig = TARGET_CONFIG[target] || {};
  const upstreamHeaders = {
    Accept: 'application/json'
  };

  if (targetConfig.token) {
    upstreamHeaders[targetConfig.header] = targetConfig.token;
  }

  try {
    const response = await fetch(upstreamUrl.toString(), {
      headers: upstreamHeaders,
      method: 'GET'
    });

    const responseText = await response.text();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: CORS_HEADERS,
        body: responseText
      };
    }

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      },
      body: responseText
    };
  } catch (error) {
    console.error('razrOS proxy error:', error);
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Proxy request failed',
        details: error.message
      })
    };
  }
};

