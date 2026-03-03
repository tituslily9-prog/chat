const {
  initFirebase,
  PERSONAS,
  generatePersonaRemark,
  postPersonaMessage
} = require('./_persona-bot-utils');

const ROTATION = ['lebron', 'btc', 'mj'];

exports.handler = async () => {
  const { admin, realtimeDb } = initFirebase();

  try {
    const stateRef = realtimeDb.ref('whyRoom/admin/personaBots/state');
    const snapshot = await stateRef.once('value');
    const state = snapshot.val() || {};

    let nextIndex = typeof state.nextIndex === 'number' ? state.nextIndex : 0;
    if (nextIndex >= ROTATION.length || nextIndex < 0) {
      nextIndex = 0;
    }

    const personaKey = ROTATION[nextIndex];
    if (!PERSONAS[personaKey]) {
      throw new Error(`Rotation selected unknown persona: ${personaKey}`);
    }

    console.log('[persona-broadcast] firing', {
      persona: personaKey,
      nextIndex,
      previousState: state
    });

    const text = await generatePersonaRemark(personaKey, { mode: 'broadcast' });
    await postPersonaMessage(personaKey, text, { mode: 'broadcast' });

    const update = {
      nextIndex: (nextIndex + 1) % ROTATION.length,
      lastPersona: personaKey,
      lastRun: admin.database.ServerValue.TIMESTAMP
    };
    await stateRef.set(update);

    const responsePayload = {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        persona: personaKey,
        nextIndex: update.nextIndex
      })
    };

    console.log('[persona-broadcast] success', responsePayload);
    return responsePayload;
  } catch (error) {
    console.error('persona-broadcast error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to broadcast persona message', message: error.message })
    };
  }
};

