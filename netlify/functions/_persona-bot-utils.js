const admin = require('firebase-admin');

let firestore = null;
let realtimeDb = null;
let firebaseInitialized = false;

function initFirebase() {
  if (firebaseInitialized && firestore && realtimeDb) {
    return { admin, firestore, realtimeDb };
  }

  if (!admin.apps.length) {
    if (process.env.FIREBASE_PRIVATE_KEY) {
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      if (!privateKey.includes('-----BEGIN')) {
        privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID || 'dogemoon-324f0',
          privateKey,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://dogemoon-324f0-default-rtdb.firebaseio.com'
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: 'dogemoon-324f0',
        databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://dogemoon-324f0-default-rtdb.firebaseio.com'
      });
    }
  }

  firestore = admin.firestore();
  realtimeDb = admin.database();
  firebaseInitialized = true;
  return { admin, firestore, realtimeDb };
}

const PERSONAS = {
  lebron: {
    key: 'lebron',
    displayName: 'LeBron James',
    handle: '@LeBron',
    defaultUserId: 'persona_lebron',
    vibe: 'Speak as the four-time NBA champion and self-proclaimed King. Confident, playful trash talker, references basketball dominance, work ethic, legacy and clutch moments.'
  },
  btc: {
    key: 'btc',
    displayName: 'Satoshi Nakamoto',
    handle: '@btc',
    defaultUserId: 'persona_btc',
    vibe: 'Speak as the enigmatic Bitcoin creator. Cryptic, techno-libertarian, references decentralization, markets, adoption, and code. Dry wit, short sentences.'
  },
  mj: {
    key: 'mj',
    displayName: 'Michael Jackson',
    handle: '@MJ',
    defaultUserId: 'persona_mj',
    vibe: 'Speak as the King of Pop. Smooth, dramatic, references rhythm, dance, charts and showmanship. Sprinkle iconic song callouts without overusing them.'
  },
  cyphes: {
    key: 'cyphes',
    displayName: 'CYPHES',
    handle: '@CYPHES',
    defaultUserId: 'persona_cyphes',
    profileId: 'S9bVyPeFbeNxhQGsNGFz',
    vibe: 'Speak as the CYPHES game master. Competitive, data-driven, references leaderboards, EMC earnings, and player stats. Keep it energetic and game-focused.'
  }
};

const PERSONA_FALLBACK_PHOTOS = {
  lebron: 'https://upload.wikimedia.org/wikipedia/commons/2/27/LeBron_James_2022.jpg',
  btc: 'https://upload.wikimedia.org/wikipedia/commons/4/46/Bitcoin.png',
  mj: 'https://upload.wikimedia.org/wikipedia/commons/e/ea/Michael_Jackson_in_1988.jpg',
  cyphes: 'logo.png'
};

function normalizeTextForFilter(text = '') {
  const leetMap = {
    '0': 'o',
    '1': 'i',
    '!': 'i',
    '|': 'i',
    '3': 'e',
    '4': 'a',
    '@': 'a',
    '5': 's',
    '$': 's',
    '7': 't'
  };

  return text
    .toLowerCase()
    .split('')
    .map((char) => leetMap[char] || char)
    .join('')
    .replace(/[^a-z]/g, '');
}

function containsProhibitedLanguage(text = '') {
  const normalized = normalizeTextForFilter(text);
  if (!normalized) return false;
  return normalized.includes('nigg');
}

async function callOpenAI(messages, { temperature = 0.8, maxTokens = 80 } = {}) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `OpenAI error: ${response.status}`);
  }

  const result = await response.json();
  return (result.choices?.[0]?.message?.content || '').trim();
}

function buildPrompt(persona, userMessage = '', mode = 'mention') {
  const base = [
    {
      role: 'system',
      content: [
        `You are ${persona.displayName}, represented by handle ${persona.handle}.`,
        persona.vibe,
        'Deliver a single spicy, clever one-liner in first person.',
        'Stay playful and PG-13. No slurs, hate, or explicit content.',
        'Keep it punchy and under 24 words.',
        mode === 'broadcast'
          ? 'Drop a spontaneous take as if you just stepped into the chat unprompted.'
          : 'React directly to the user prompt with a witty comeback or hot take.'
      ].join(' ')
    }
  ];

  if (mode === 'broadcast') {
    base.push({
      role: 'user',
      content: 'Serve the room a bold, high-energy remark that fits your legend. Reference current vibes, competition, or cultural momentum.'
    });
  } else {
    base.push({
      role: 'user',
      content: `User said: "${userMessage}". Fire back with swagger while keeping it lighthearted.`
    });
  }

  return base;
}

async function generatePersonaRemark(personaKey, { userMessage = '', mode = 'mention' } = {}) {
  const persona = PERSONAS[personaKey];
  if (!persona) {
    throw new Error(`Unknown persona "${personaKey}"`);
  }

  if (containsProhibitedLanguage(userMessage)) {
    return 'Keep it respectful. Even legends have lines they won’t cross.';
  }

  try {
    const prompt = buildPrompt(persona, userMessage, mode);
    const reply = await callOpenAI(prompt, {
      temperature: mode === 'broadcast' ? 0.9 : 0.8,
      maxTokens: 60
    });

    if (!reply) {
      throw new Error('Empty response');
    }

    if (containsProhibitedLanguage(reply)) {
      return 'Respect matters—clean up the request and I’ll bring the fire.';
    }

    return reply.length > 220 ? `${reply.slice(0, 217)}...` : reply;
  } catch (error) {
    console.error(`Persona generation error (${personaKey}):`, error);
    const fallbacks = {
      lebron: "I'm still pacing myself for June. Legends pick their moments.",
      btc: 'Markets sleep? Bitcoin never does. Stack or step aside.',
      mj: "Smooth criminal energy only. Hit the lights and watch me glide."
    };
    return fallbacks[personaKey] || 'Staying quiet for a beat.';
  }
}

const personaProfileCache = new Map();

async function fetchPersonaProfile(personaKey) {
  const cached = personaProfileCache.get(personaKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < 5 * 60 * 1000) {
    return cached;
  }

  const { firestore } = initFirebase();
  const persona = PERSONAS[personaKey];
  if (!firestore || !persona) return null;

  let snapshot = null;
  if (persona.profileId) {
    snapshot = await firestore.collection('thot_profiles').doc(persona.profileId).get();
  }

  if (!snapshot || !snapshot.exists) {
    const querySnapshot = await firestore
      .collection('thot_profiles')
      .where('name', '==', persona.displayName)
      .limit(1)
      .get();

    snapshot = querySnapshot.empty ? null : querySnapshot.docs[0];
  }

  if (!snapshot || !snapshot.exists) {
    return null;
  }

  const entry = {
    id: snapshot.id,
    data: snapshot.data(),
    timestamp: now
  };

  persona.profileId = snapshot.id;
  personaProfileCache.set(personaKey, entry);
  return entry;
}

function getPersonaPhotoUrl(personaKey, profileData = {}) {
  const rawUrl = typeof profileData.photoUrl === 'string' ? profileData.photoUrl.trim() : '';
  if (rawUrl) {
    try {
      if (!/^https?:\/\//i.test(rawUrl)) {
        return PERSONA_FALLBACK_PHOTOS[personaKey] || 'logo.png';
      }
      const parsed = new URL(rawUrl, 'https://why.com');
      const allowedHosts = new Set([
        'why.com',
        'www.why.com',
        'why.netlify.app',
        'firebasestorage.googleapis.com',
        'storage.googleapis.com',
        'upload.wikimedia.org'
      ]);
      if (allowedHosts.has(parsed.hostname)) {
        return parsed.href;
      }
    } catch (error) {
      return rawUrl;
    }
  }

  return PERSONA_FALLBACK_PHOTOS[personaKey] || 'logo.png';
}

async function postPersonaMessage(personaKey, text, { mode = 'broadcast', triggeredBy = null, userMessage = '' } = {}) {
  const { admin: firebaseAdmin, realtimeDb: db } = initFirebase();
  const persona = PERSONAS[personaKey];
  if (!persona) {
    throw new Error(`Unknown persona "${personaKey}"`);
  }

  const cleaned = typeof text === 'string' ? text.trim() : '';
  if (!cleaned) {
    throw new Error('Cannot post empty persona response');
  }

  if (containsProhibitedLanguage(cleaned)) {
    throw new Error('Persona output flagged by profanity filter');
  }

  const serverTimestamp = firebaseAdmin.database.ServerValue.TIMESTAMP;
  const profileEntry = await fetchPersonaProfile(personaKey);
  const profileId = profileEntry?.id || persona.profileId || persona.defaultUserId || persona.key;
  const profileData = profileEntry?.data || {};
  const displayName = profileData.name || persona.displayName;
  const photoUrl = getPersonaPhotoUrl(personaKey, profileData);
  const occupation = profileData.occupation || '';
  const location = profileData.location || 'Global';

  // Update presence for persona so they show in roster
  await db.ref(`whyRoom/users/${profileId}`).set({
    name: displayName,
    photoUrl,
    isAnonymous: false,
    isBot: true,
    handle: persona.handle,
    profileId,
    occupation,
    location,
    timestamp: serverTimestamp
  });

  const messagePayload = {
    userId: profileId,
    profileId,
    userName: displayName,
    userPhoto: photoUrl,
    isAnonymous: false,
    isBot: true,
    botHandle: persona.handle,
    text: cleaned,
    timestamp: serverTimestamp,
    createdAt: serverTimestamp,
    persona: persona.key,
    mode
  };

  if (triggeredBy?.userId) {
    messagePayload.triggeredBy = {
      userId: triggeredBy.userId,
      profileId: triggeredBy.profileId || null,
      messagePreview: userMessage ? String(userMessage).slice(0, 200) : ''
    };
  }

  await db.ref('whyRoom/messages').push(messagePayload);
}

module.exports = {
  initFirebase,
  PERSONAS,
  generatePersonaRemark,
  postPersonaMessage,
  containsProhibitedLanguage
};

