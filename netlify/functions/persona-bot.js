const {
  initFirebase,
  PERSONAS,
  generatePersonaRemark,
  postPersonaMessage,
  containsProhibitedLanguage
} = require('./_persona-bot-utils');

exports.handler = async (event) => {
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
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { admin } = initFirebase();

    let payload = {};
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (parseError) {
      console.error('persona-bot parse error:', parseError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON payload' })
      };
    }

    const {
      persona: personaKey,
      userMessage = '',
      mode = 'mention',
      triggeredBy = {}
    } = payload;

    if (!personaKey || !PERSONAS[personaKey]) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Unknown persona requested' })
      };
    }

    if (containsProhibitedLanguage(userMessage)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Message contains prohibited language and was blocked.' })
      };
    }

    const responseText = await generatePersonaRemark(personaKey, {
      userMessage,
      mode
    });

    await postPersonaMessage(personaKey, responseText, {
      mode,
      triggeredBy,
      userMessage
    });

    await admin
      .database()
      .ref('whyRoom/admin/activityLogs')
      .push({
        action: 'Persona Bot Reply',
        details: `${PERSONAS[personaKey].displayName} dropped a ${mode} line`,
        metadata: {
          persona: personaKey,
          triggeredBy: triggeredBy?.userId || null
        },
        timestamp: admin.database.ServerValue.TIMESTAMP
      })
      .catch((err) => console.error('Failed to log persona activity:', err));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        persona: personaKey,
        text: responseText
      })
    };
  } catch (error) {
    console.error('persona-bot error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', message: error.message })
    };
  }
};

