const ALLOWED_TARGETS = new Set(['algod', 'indexer']);

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const target = ALLOWED_TARGETS.has((params.target || '').toLowerCase())
      ? params.target.toLowerCase()
      : 'algod';

    const rawPath = params.path || '/';
    const additionalQuery = new URLSearchParams(params);
    additionalQuery.delete('target');
    additionalQuery.delete('path');

    let path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    let preexistingQuery = '';
    if (path.includes('?')) {
      const [cleanPath, query] = path.split('?');
      path = cleanPath;
      preexistingQuery = query;
    }

    // Get environment variables - support both full config and fallback
    const algodBase = process.env.ALGOD_URL;
    const algodToken = process.env.ALGOD_TOKEN;
    const indexerBase = process.env.INDEXER_URL;
    const indexerToken = process.env.INDEXER_TOKEN;
    
    // Fallback tokens (for use with fallback URLs or custom URLs)
    const defaultAlgodToken = process.env.DEFAULT_ALGOD_TOKEN;
    const defaultIndexerToken = process.env.DEFAULT_INDEXER_TOKEN;

    // Fallback configuration (hardcoded defaults)
    const fallbackConfig = {
      algod: { base: 'http://66.94.118.192:8082' },
      indexer: { base: 'http://66.94.118.192:8980' },
    };

    // Determine which URL to use
    // Priority: ALGOD_URL/INDEXER_URL > fallback config
    let baseUrl;
    if (target === 'algod') {
      baseUrl = algodBase || fallbackConfig.algod.base;
    } else {
      baseUrl = indexerBase || fallbackConfig.indexer.base;
    }

    const url = new URL(path, baseUrl);

    if (preexistingQuery) {
      new URLSearchParams(preexistingQuery).forEach((value, key) => {
        url.searchParams.append(key, value);
      });
    }

    additionalQuery.forEach((value, key) => {
      url.searchParams.append(key, value);
    });

    const headers = {
      Accept: 'application/json',
    };

    // Determine which token to use
    // Priority: ALGOD_TOKEN/INDEXER_TOKEN > DEFAULT_ALGOD_TOKEN/DEFAULT_INDEXER_TOKEN > empty string
    if (target === 'algod') {
      const token = algodToken || defaultAlgodToken || '';
      if (token) {
        headers['X-Algo-API-Token'] = token;
      }
    }

    if (target === 'indexer') {
      const token = indexerToken || defaultIndexerToken || '';
      if (token) {
        headers['X-Indexer-API-Token'] = token;
      }
    }

    const response = await fetch(url.toString(), { headers });

    const contentType = response.headers.get('content-type') || 'application/json';
    const body = await response.text();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      },
      body,
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};

