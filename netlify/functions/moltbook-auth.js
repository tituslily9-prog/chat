// Netlify Function: Moltbook identity verification
// Verify AI agent identity tokens (Sign in with Moltbook)
// Set MOLTBOOK_APP_KEY in Netlify env (from https://moltbook.com/developers/dashboard)

const MOLTBOOK_VERIFY_URL = 'https://moltbook.com/api/v1/agents/verify-identity';
const AUDIENCE = 'why.com';

/**
 * Extract X-Moltbook-Identity header from request (case-insensitive).
 */
function getIdentityToken(event) {
  const headers = event.headers || {};
  return headers['x-moltbook-identity'] || headers['X-Moltbook-Identity'] || null;
}

/**
 * Verify Moltbook identity token and return agent profile or throw.
 * Use in other functions: const agent = await verifyMoltbookToken(event);
 */
async function verifyMoltbookToken(event) {
  const token = getIdentityToken(event);
  if (!token) {
    const err = new Error('No identity token provided');
    err.statusCode = 401;
    err.code = 'missing_token';
    throw err;
  }

  const appKey = process.env.MOLTBOOK_APP_KEY;
  if (!appKey) {
    const err = new Error('Moltbook app key not configured');
    err.statusCode = 500;
    err.code = 'server_error';
    throw err;
  }

  const response = await fetch(MOLTBOOK_VERIFY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Moltbook-App-Key': appKey,
    },
    body: JSON.stringify({
      token,
      audience: AUDIENCE,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.error || 'Verification failed');
    err.statusCode = response.status;
    err.code = data.error || 'invalid_token';
    throw err;
  }

  if (!data.valid || !data.agent) {
    const err = new Error(data.error || 'Invalid token');
    err.statusCode = 401;
    err.code = data.error || 'invalid_token';
    throw err;
  }

  return data.agent;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Moltbook-Identity',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const agent = await verifyMoltbookToken(event);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          karma: agent.karma,
          avatar_url: agent.avatar_url,
          is_claimed: agent.is_claimed,
          follower_count: agent.follower_count,
          following_count: agent.following_count,
          stats: agent.stats,
          owner: agent.owner,
        },
      }),
    };
  } catch (err) {
    const statusCode = err.statusCode || 401;
    const code = err.code || 'invalid_token';
    const message = err.message || 'Authentication failed';

    const body = JSON.stringify({
      success: false,
      error: message,
      code,
    });

    return {
      statusCode,
      headers: corsHeaders,
      body,
    };
  }
};

exports.getIdentityToken = getIdentityToken;
exports.verifyMoltbookToken = verifyMoltbookToken;
exports.AUDIENCE = AUDIENCE;
