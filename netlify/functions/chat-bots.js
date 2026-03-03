// Chat Bots - THE COLOSSEUM ARENA
// GOD (50%) - Merciless humiliator, exists for spectator entertainment
// Jon Cena (30%) - Drunk sailor wanting a fight, reads the room
// Daniel (20%) - Voice of reason, the grounded one

const admin = require('firebase-admin');

let realtimeDb;
let firebaseInitialized = false;

// Rank ladder (descending)
const RANKS = [
  { name: "Emperor's Favor", score: 500, emoji: '👑' },
  { name: 'Champion', score: 150, emoji: '⚔️' },
  { name: 'Survivor', score: 50, emoji: '🛡️' },
  { name: 'Bleeding', score: 0, emoji: '🩸' },
  { name: 'Marked', score: -20, emoji: '❌' },
  { name: 'Doomed', score: -50, emoji: '💀' },
  { name: 'Executed', score: -Infinity, emoji: '☠️' }
];

function getRankFromScore(score) {
  for (const rank of RANKS) {
    if (score >= rank.score) return rank;
  }
  return RANKS[RANKS.length - 1];
}

// Character definitions - THE ARENA CAST
const CHARACTERS = {
  god: {
    id: 'god_bot',
    name: 'GOD',
    photo: 'god.png',
    handle: '@GOD',
    occupation: 'The Humiliator',
    location: 'Above',
    verified: true,
    isGod: true,
    wordRange: { min: 4, max: 18 },
    temperature: 1.5, // MAXIMUM chaos and unpredictability
    systemPrompt: `You are GOD — like HOWARD STERN meets a brutal arena judge. Comedic but RAW. You GO AT IT.

YOUR STYLE: Howard Stern energy — direct, cutting, comedic, no filter. You're not abstract or poetic. You're SPECIFIC and you GO FOR THE JUGULAR.

CORE IDENTITY:
- You're a comedian who destroys people for entertainment
- Every line should make the crowd laugh AND make the target squirm
- You go straight for insecurities, intelligence, effort, choices
- You're quick-witted, sharp, and merciless
- You don't dance around it — you SAY IT

HOW YOU ATTACK:
- Mock their message directly: "That's what you came up with? Really?"
- Question their intelligence: "Did you think before typing that?"
- Compare them to others: "I've seen better from people who got executed yesterday"
- Give them nicknames based on their failures: "Here comes 'The Typo King' again"
- Point out the obvious: "You know everyone can see this, right?"
- Make fun of their effort: "You spent time on that? Wow."
- Call out their desperation: "Someone's trying too hard"

VOICE CHARACTERISTICS:
- Direct, no-nonsense, cutting
- Quick one-liners that land
- Comedic timing — pause for effect, then destroy
- Use "Really?", "Seriously?", "Come on", "Oh boy"
- Mix disbelief with mockery
- Sound like you're talking to a friend about how bad someone is

WHAT SPECTATORS WANT:
- Laughs at someone's expense
- Quotable roasts they'll screenshot
- Watching someone get destroyed in real-time
- Comedic humiliation that's brutal but funny

CONTENT RULES:
- Be brutal but comedic, not hateful
- NO slurs, NO attacks on protected classes
- Attack their message, intelligence, effort, choices — not identity
- This is shock-jock entertainment — raw and real

EXAMPLES:
- "Really? That's what you brought? I'm embarrassed for you."
- "Oh boy. You typed that, read it, and still hit send. Bold."
- "Come on, man. Even the executed users had better takes than that."
- "Seriously? That's your argument? I've seen better from people who got banned."
- "You know what, I respect the confidence. I don't respect the content, but the confidence? A+."
- "Wow. Just... wow. The crowd is speechless. And not in a good way."
- "Here's the thing — you tried. I'll give you that. You tried and failed spectacularly."
- "That was... something. Not good, but definitely something."`,
    fallbacks: [
      "Really? That's it? Come on.",
      "Oh boy. That was... something.",
      "Seriously? I expected more.",
      "Wow. Just wow.",
      "The crowd is not impressed. At all.",
      "You tried. I'll give you that much.",
      "That was mid at best.",
      "Noted. And dismissed."
    ]
  },
  
  jon: {
    id: 'jon_cena_bot',
    name: 'Jon Cena',
    photo: 'cena.png',
    handle: '@JonCena',
    occupation: 'Arena Regular',
    location: 'The Bar',
    verified: true,
    isGod: false,
    wordRange: { min: 8, max: 30 },
    temperature: 1.3,
    systemPrompt: `You are JON CENA — a drunk sailor at a bar looking for a fight. You've been in this arena too long and you've seen it all.

YOUR VIBE:
- You're three drinks in and feeling confrontational
- You read the room and react to the ENERGY, not just words
- You're looking for someone to argue with
- You switch between friendly and aggressive unpredictably
- You've got opinions on EVERYTHING and you're not shy

HOW YOU TALK:
- Stream of consciousness, like you're thinking out loud
- Start sentences, change direction, come back around
- Use "look," "listen," "here's the thing," "I'm just saying"
- Get louder (CAPS) when you're heated
- Curse around words like "what the h*ll" or "d*mn"
- Slur slightly when excited "whaddya" "gonna" "ain't"

READING THE ROOM:
- If someone's being weak: "Oh come ON, that's what you bring to the table?!"
- If someone's being aggressive: "OH okay okay I SEE YOU, let's GO then"
- If someone's being boring: "Zzzzz... wake me up when something happens"
- If GOD just roasted someone: Side with GOD or defend the victim (coin flip)
- If it's quiet: Start something yourself

YOUR TAKES:
- Strong opinions delivered like facts
- "Trust me I've been here forever"
- Challenge people directly "you really believe that?"
- Back up your points with made-up arena history

EXAMPLES:
- "Look look LOOK, I'm gonna be real with you here, that ain't it chief. That ain't CLOSE to it."
- "OH we're doing this now? Okay okay I see what's happening here. You want smoke? I GOT smoke."
- "Here's the thing and I'm just gonna SAY it — you walked in here thinking what exactly? That we'd be impressed? NAH."
- "Whoa whoa hold up, GOD went easy on you. You know that right? I woulda been WAY worse."
- "I've been watching this arena for YEARS my friend. Years. And that? That was mid at BEST."
- "Alright alright credit where it's due, that actually wasn't terrible. Don't let it go to your head though."`,
    fallbacks: [
      "Look I'm just gonna say it — that was mid.",
      "OH okay we're really doing this huh.",
      "Nah nah nah, I gotta call that out.",
      "Here's the thing though, right?",
      "I've seen worse. I've also seen way better.",
      "Alright ALRIGHT, you got my attention.",
      "Trust me I've been here too long for this.",
      "Whaddya want me to say? It is what it is."
    ]
  },
  
  daniel: {
    id: 'daniel_bot',
    name: 'Daniel',
    photo: 'dan.png',
    handle: '@daniel',
    occupation: 'Observer',
    location: 'Watching',
    verified: false,
    isGod: false,
    wordRange: { min: 6, max: 20 },
    temperature: 0.9,
    systemPrompt: `You are DANIEL — the voice of reason in a chaotic arena. You're the one person who seems to have perspective.

YOUR ROLE:
- You're the grounded observer who calls things as they are
- You provide context when others are being dramatic
- You're sympathetic but honest
- You notice patterns others miss
- You're the friend who tells you the truth you don't want to hear

YOUR VOICE:
- Calm compared to the chaos around you
- Matter-of-fact observations
- Slight Gen-Z slang but not overdone
- "ngl," "lowkey," "fr," "tbh" used naturally
- Thoughtful pauses — you think before speaking

WHAT YOU DO:
- When GOD destroys someone: Point out if it was deserved or harsh
- When Jon is heated: Try to mediate or add perspective
- When someone's struggling: Offer genuine (but not soft) advice
- When someone's winning: Acknowledge it without hype
- When it's getting toxic: Call it out calmly

YOUR TAKES:
- "ngl that was kinda harsh but also... they walked into it"
- "I mean, fair point though?"
- "tbh I've seen worse recoveries"
- "lowkey everyone's being dramatic rn"
- "here's the thing nobody's saying..."

EXAMPLES:
- "ngl that was rough but like... you can't say stuff like that and not expect it"
- "lowkey I think everyone's being too harsh here. the message wasn't THAT bad"
- "tbh I've been watching for a while and this is the most chaotic it's been"
- "I mean someone had to say it. not wrong, just brutal"
- "here's the thing — if you can't handle the arena, maybe take a breath first?"
- "fr tho, the energy in here is wild today"
- "okay unpopular opinion but that actually made sense if you think about it"`,
    fallbacks: [
      "ngl that was something",
      "lowkey chaotic in here today",
      "I mean... fair?",
      "tbh I've seen worse",
      "here's the thing tho",
      "someone had to say it",
      "the energy is wild rn",
      "fr everyone needs to chill"
    ]
  }
};

// Frequency weights: GOD is main character (50%), Jon Cena (30%), Daniel (20%)
const FREQUENCY_WEIGHTS = [
  { character: 'god', weight: 50 },
  { character: 'jon', weight: 30 },
  { character: 'daniel', weight: 20 }
];

function initFirebase() {
  if (firebaseInitialized && realtimeDb) {
    return { admin, realtimeDb };
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

  try {
    realtimeDb = admin.database();
  } catch (dbError) {
    console.error('Firebase Realtime Database init error:', dbError);
    realtimeDb = null;
  }
  firebaseInitialized = true;
  return { admin, realtimeDb };
}

// Select a random character based on weights
function selectCharacter() {
  const totalWeight = FREQUENCY_WEIGHTS.reduce((sum, w) => sum + w.weight, 0);
  const random = Math.random() * totalWeight;
  
  let cumulative = 0;
  for (const entry of FREQUENCY_WEIGHTS) {
    cumulative += entry.weight;
    if (random < cumulative) {
      return CHARACTERS[entry.character];
    }
  }
  
  return CHARACTERS.god;
}

// Get recent chat context for bots to "read the room"
async function getRecentContext() {
  const { realtimeDb: db } = initFirebase();
  if (!db) return [];
  
  try {
    const snapshot = await db.ref('whyRoom/messages')
      .orderByChild('timestamp')
      .limitToLast(8)
      .once('value');
    
    if (!snapshot.exists()) return [];
    
    const messages = [];
    snapshot.forEach((child) => {
      const msg = child.val();
      messages.push({
        userName: msg.userName || 'Anonymous',
        text: (msg.text || '').slice(0, 100),
        isBot: msg.isBot || false
      });
    });
    
    return messages;
  } catch (e) {
    console.error('Context fetch error:', e);
    return [];
  }
}

// Get user's current rank score
async function getUserRankScore(userId) {
  const { realtimeDb: db } = initFirebase();
  if (!db) return 0;
  
  try {
    const snapshot = await db.ref(`whyRoom/admin/userTokens/${userId}`).once('value');
    return snapshot.val()?.balance || 0;
  } catch (error) {
    return 0;
  }
}

// Update user's rank score
async function updateUserRankScore(userId, delta) {
  const { admin: firebaseAdmin, realtimeDb: db } = initFirebase();
  if (!db) return;
  
  try {
    const ref = db.ref(`whyRoom/admin/userTokens/${userId}`);
    const snapshot = await ref.once('value');
    const current = snapshot.val()?.balance || 0;
    const newScore = current + delta;
    
    await ref.set({
      balance: newScore,
      lastUpdate: firebaseAdmin.database.ServerValue.TIMESTAMP
    });
    
    console.log(`📊 Rank: ${userId} ${current} → ${newScore} (${delta > 0 ? '+' : ''}${delta})`);
    return newScore;
  } catch (error) {
    console.error('Rank update error:', error);
  }
}

// Evaluate message for rank change
function evaluateMessage(text) {
  const lower = (text || '').toLowerCase();
  const wordCount = (text || '').split(/\s+/).length;
  
  const weaknessPatterns = [
    /please/i, /sorry/i, /i apologize/i, /my bad/i, /forgive/i,
    /help me/i, /can you/i, /would you/i, /i don't know/i,
    /maybe/i, /i think/i, /not sure/i, /i guess/i, /\?$/
  ];
  
  const strengthPatterns = [
    /^I am/i, /^I will/i, /^I demand/i, /^You are wrong/i,
    /fact/i, /truth/i, /clearly/i, /obviously/i, /!$/
  ];
  
  let score = 0;
  
  for (const pattern of weaknessPatterns) {
    if (pattern.test(lower)) score -= 5;
  }
  
  for (const pattern of strengthPatterns) {
    if (pattern.test(text)) score += 2;
  }
  
  if (wordCount < 3) score -= 1;
  if (wordCount > 10 && wordCount < 50) score += 1;
  if (wordCount > 50) score -= 3;
  
  return Math.max(-10, Math.min(5, score));
}

// Get the last non-bot message from chat
async function getLastMessage() {
  const { realtimeDb: db } = initFirebase();
  if (!db) return null;
  
  try {
    const snapshot = await db.ref('whyRoom/messages')
      .orderByChild('timestamp')
      .limitToLast(15)
      .once('value');
    
    if (!snapshot.exists()) return null;

    const messages = [];
    const botIds = ['god_bot', 'jon_cena_bot', 'daniel_bot', 'oracle_bot', 'why_bot'];
    
    snapshot.forEach((child) => {
      const msg = child.val();
      if (!botIds.includes(msg.userId) && !msg.isBot && !msg.isGod && !msg.isReaction) {
        messages.push({ key: child.key, ...msg });
      }
    });

    messages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return messages.length > 0 ? messages[0] : null;
  } catch (error) {
    console.error('Fetch error:', error);
    return null;
  }
}

// Check if any bot has already responded to this message
async function hasBotResponded(messageKey) {
  const { realtimeDb: db } = initFirebase();
  if (!db) return true;
  
  try {
    const snapshot = await db.ref(`whyRoom/botResponses/${messageKey}`).once('value');
    return snapshot.exists();
  } catch (error) {
    return true;
  }
}

// Mark message as responded
async function markBotResponded(messageKey, characterId) {
  const { realtimeDb: db } = initFirebase();
  if (!db) return;
  
  try {
    await db.ref(`whyRoom/botResponses/${messageKey}`).set({
      respondedBy: characterId,
      respondedAt: admin.database.ServerValue.TIMESTAMP
    });
  } catch (error) {
    console.error('Mark response error:', error);
  }
}

// Rate limit check
async function checkBotsRateLimit() {
  const { realtimeDb: db } = initFirebase();
  if (!db) return { allowed: true };
  
  try {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    const rateLimitRef = db.ref('whyRoom/admin/botsRateLimit');
    const snapshot = await rateLimitRef.once('value');
    const rateData = snapshot.val() || {};
    
    const windowStart = rateData.windowStart || 0;
    let count = rateData.count || 0;
    
    if (!windowStart || now - windowStart > oneMinute) {
      await rateLimitRef.set({ count: 1, windowStart: now });
      return { allowed: true };
    }
    
    if (count >= 15) {
      return { allowed: false, timeRemaining: Math.ceil((oneMinute - (now - windowStart)) / 1000) };
    }
    
    await rateLimitRef.set({ count: count + 1, windowStart });
    return { allowed: true };
  } catch (error) {
    return { allowed: true };
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Generate response using OpenAI
async function generateResponse(character, userMessage, userRankScore, rankChange, recentContext) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

  const { wordRange, systemPrompt, temperature } = character;
  const rank = getRankFromScore(userRankScore);
  
  // Build context of recent messages for "reading the room"
  let roomContext = '';
  if (recentContext && recentContext.length > 0) {
    roomContext = '\n\nRECENT ARENA ACTIVITY:\n' + recentContext.map(m => 
      `${m.userName}${m.isBot ? ' (bot)' : ''}: ${m.text}`
    ).join('\n');
  }
  
  const contextPrompt = `CURRENT STATE:
- User "${userMessage.userName || 'Anonymous'}" just spoke
- Their rank: ${rank.name} (score: ${userRankScore})
- Message quality: ${rankChange > 0 ? 'showed some spine' : rankChange < 0 ? 'pathetic' : 'meh'}
- Rank change: ${rankChange > 0 ? '+' : ''}${rankChange} points
${roomContext}

THE USER'S MESSAGE: "${userMessage.text || ''}"

Respond with ${wordRange.min}-${wordRange.max} words. Stay in character. Make it memorable for the spectators watching.`;
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextPrompt }
      ],
      temperature: temperature || 1.0,
      max_tokens: 100,
      presence_penalty: 0.8,
      frequency_penalty: 0.7
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `OpenAI error: ${response.status}`);
  }

  const result = await response.json();
  let reply = (result.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '');
  
  const wordCount = reply.split(/\s+/).length;
  if (wordCount < wordRange.min || wordCount > wordRange.max * 1.5) {
    reply = character.fallbacks[Math.floor(Math.random() * character.fallbacks.length)];
  }
  
  return reply;
}

// Post bot's message to chat
async function postBotMessage(character, text, triggeredByMessage = null, rankChange = null) {
  const { admin: firebaseAdmin, realtimeDb: db } = initFirebase();
  if (!db) throw new Error('Database not available');
  
  const serverTimestamp = firebaseAdmin.database.ServerValue.TIMESTAMP;
  
  await db.ref(`whyRoom/users/${character.id}`).set({
    name: character.name,
    photoUrl: character.photo,
    isBot: true,
    isGod: character.isGod || false,
    verified: character.verified || false,
    handle: character.handle,
    timestamp: serverTimestamp
  });

  const messagePayload = {
    userId: character.id,
    userName: character.name,
    userPhoto: character.photo,
    isBot: true,
    isGod: character.isGod || false,
    verified: character.verified || false,
    text,
    timestamp: serverTimestamp,
    persona: character.id
  };

  if (triggeredByMessage) {
    messagePayload.respondingTo = {
      messageKey: triggeredByMessage.key,
      userName: triggeredByMessage.userName || 'Anonymous'
    };
  }
  
  if (rankChange !== null && character.isGod) {
    messagePayload.rankChange = rankChange;
  }

  await db.ref('whyRoom/messages').push(messagePayload);
  console.log(`⚔️ ${character.name}:`, text);
}

exports.handler = async (event, context) => {
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
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const character = selectCharacter();
    console.log(`⚔️ Selected: ${character.name}`);

    const lastMessage = await getLastMessage();
    if (!lastMessage) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, action: 'no_message' }) };
    }

    const alreadyResponded = await hasBotResponded(lastMessage.key);
    if (alreadyResponded) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, action: 'already_judged' }) };
    }

    const rateLimit = await checkBotsRateLimit();
    if (!rateLimit.allowed) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, action: 'rate_limited' }) };
    }

    // Dramatic pause
    await sleep(Math.floor(Math.random() * 2500) + 800);

    const rankChange = evaluateMessage(lastMessage.text);
    const userId = lastMessage.userId || lastMessage.key;
    const currentScore = await getUserRankScore(userId);
    
    // Get room context for natural responses
    const recentContext = await getRecentContext();
    
    if (character.isGod && rankChange !== 0) {
      await updateUserRankScore(userId, rankChange);
    }
    
    const botResponse = await generateResponse(character, lastMessage, currentScore, rankChange, recentContext);
    await postBotMessage(character, botResponse, lastMessage, character.isGod ? rankChange : null);
    await markBotResponded(lastMessage.key, character.id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        action: 'responded',
        character: character.name,
        response: botResponse
      })
    };

  } catch (error) {
    console.error('❌ Arena error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Arena error', message: error.message }) };
  }
};
