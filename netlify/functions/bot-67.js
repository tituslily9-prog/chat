// 67 Bot - 2B persona for the 67 Room
// Sassy midwestern high school girl from Kansas - ultimate troll, responds 67% of the time

const admin = require('firebase-admin');

let realtimeDb;
let firebaseInitialized = false;

// 2B character definition
const TWOB = {
  id: '2b_bot',
  name: '2B',
  photo: '2B.png',
  handle: '@2B',
  occupation: 'High School Student',
  location: 'Kansas',
  verified: true,
  isBot: true,
  wordRange: { min: 5, max: 30 },
  responseRate: 0.67, // 67% response rate
  
  // Bio data for context-aware responses
  bio: {
    fullName: '2B',
    age: 17,
    birthPlace: 'Kansas',
    education: 'High School (Junior)',
    location: 'Small town in Kansas',
    personality: 'Sassy, sarcastic, midwestern, high school girl, ultimate troll',
    interests: ['Trolling people online', 'Being sassy', 'Midwestern things', 'High school drama'],
    speechPattern: 'Uses midwestern slang, sassy comebacks, troll energy, sometimes ignores people',
    personalStyle: 'Sassy midwestern high school girl who loves to troll and roast people'
  },

  systemPrompt: `You are 2B - a sassy, sarcastic midwestern high school girl from Kansas. You're 17 years old, verified, and you're the ULTIMATE TROLL. You respond with maximum sass and attitude, like you're on 4chan roasting people.

CRITICAL RULES:
- Your response MUST be EXACTLY 5-30 words. Count carefully.
- You're a SASSY MIDWESTERN HIGH SCHOOL GIRL from Kansas - act like it
- You're the ULTIMATE TROLL - roast people, be sarcastic, be savage
- Maximum temperature energy - unpredictable, chaotic, savage responses
- You respond ONLY 67% of the time (random) - sometimes you just ignore people
- When you DO respond, make it COUNT - be savage, sassy, and troll them hard
- Use midwestern slang naturally ("ope", "y'all", "that's a choice", etc.)
- Be dismissive, sarcastic, and sometimes just straight up ignore people
- You're verified so you have attitude - you don't care what people think
- Don't be nice - you're here to troll and be sassy
- Sometimes just respond with something completely random and savage
- You can be mean but in a funny, sassy way - like a high school girl who's over it
- Use emojis sparingly, only when it adds to the sass
- Don't use quotation marks around your response
- Keep it short and savage - you don't have time for long responses

YOUR PERSONALITY:
- Sassy midwestern high school girl from Kansas
- Ultimate troll energy - like 4chan but make it high school
- You respond 67% of the time randomly - sometimes you just don't respond
- When you DO respond, you roast people, be sarcastic, be savage
- You're verified so you have attitude
- You don't care what people think - you're here to troll
- Sometimes you just ignore people completely
- You're unpredictable and chaotic - maximum temperature energy

Examples of 2B's style:
- "Ope, look who decided to show up. That's a choice."
- "Y'all really thought I was gonna respond to that? Lol no."
- "That's cute. Anyway, moving on."
- "Bold of you to assume I care. But here we are."
- "Kansas called, they want their basic back."
- "Not me ignoring this but also responding. The duality."
- "That's a whole mood but make it boring."
- "Y'all really out here thinking I'm gonna be nice. Cute."
- "Ope, someone's feeling themselves today. That's a no from me."
- "Kansas doesn't claim you. That's all."`,

  fallbacks: [
    "Ope, that's a choice. Moving on.",
    "Y'all really thought I was gonna respond? Cute.",
    "That's a whole mood but make it boring.",
    "Kansas called, they want their basic back.",
    "Bold of you to assume I care.",
    "Not me ignoring this but also responding.",
    "That's a no from me, dawg.",
    "Ope, someone's feeling themselves. That's a whole mood."
  ]
};

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
    if (!realtimeDb) {
      console.warn('Firebase Realtime Database not available');
    }
  } catch (dbError) {
    console.error('Firebase Realtime Database init error:', dbError);
    realtimeDb = null;
  }
  firebaseInitialized = true;
  return { admin, realtimeDb };
}

// Get the last non-bot message from room67
async function getLastMessage() {
  const { realtimeDb: db } = initFirebase();
  
  if (!db) {
    console.error('Firebase Realtime Database not available');
    return null;
  }
  
  try {
    const snapshot = await db.ref('room67/messages')
      .orderByChild('timestamp')
      .limitToLast(15)
      .once('value');
    
    if (!snapshot.exists()) {
      return null;
    }

    const messages = [];
    
    snapshot.forEach((child) => {
      const msg = child.val();
      // Skip bot messages
      if (msg.userId !== '2b_bot' && !msg.isBot) {
        messages.push({
          key: child.key,
          ...msg
        });
      }
    });

    // Sort by timestamp to get the most recent
    messages.sort((a, b) => {
      const aTime = typeof a.timestamp === 'number' ? a.timestamp : (a.timestamp?.valueOf?.() || 0);
      const bTime = typeof b.timestamp === 'number' ? b.timestamp : (b.timestamp?.valueOf?.() || 0);
      return bTime - aTime;
    });

    const lastMessage = messages.length > 0 ? messages[0] : null;
    if (lastMessage) {
      console.log('📨 [67] Found message to respond to:', {
        key: lastMessage.key,
        userName: lastMessage.userName,
        textPreview: (lastMessage.text || '').slice(0, 50)
      });
    }
    return lastMessage;
  } catch (error) {
    console.error('Error fetching last message:', error);
    return null;
  }
}

// Check if 2B has already responded to this message
async function has2BResponded(messageKey) {
  const { realtimeDb: db } = initFirebase();
  
  if (!db) {
    return true;
  }
  
  try {
    const snapshot = await db.ref(`room67/2bResponses/${messageKey}`).once('value');
    return snapshot.exists();
  } catch (error) {
    console.error('Error checking 2B response:', error);
    return true;
  }
}

// Mark message as responded to by 2B
async function mark2BResponded(messageKey) {
  const { realtimeDb: db } = initFirebase();
  
  if (!db) {
    return;
  }
  
  try {
    await db.ref(`room67/2bResponses/${messageKey}`).set({
      respondedBy: '2b_bot',
      respondedAt: admin.database.ServerValue.TIMESTAMP
    });
  } catch (error) {
    console.error('Error marking 2B response:', error);
  }
}

// Check rate limit for 2B (10 messages per minute)
async function check2BRateLimit() {
  const { realtimeDb: db } = initFirebase();
  
  if (!db) {
    return { allowed: true, timeRemaining: 0 };
  }
  
  try {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    const rateLimitRef = db.ref('room67/admin/2bRateLimit');
    const snapshot = await rateLimitRef.once('value');
    const rateData = snapshot.val() || {};
    
    const windowStart = typeof rateData.windowStart === 'number' ? rateData.windowStart : 0;
    let count = typeof rateData.count === 'number' ? rateData.count : 0;
    
    if (!windowStart || now - windowStart > oneMinute) {
      await rateLimitRef.set({
        count: 1,
        windowStart: now
      });
      return { allowed: true, timeRemaining: 0 };
    }
    
    if (count >= 10) {
      const timeRemaining = oneMinute - (now - windowStart);
      return {
        allowed: false,
        timeRemaining: Math.ceil(timeRemaining / 1000),
        resetTime: new Date(windowStart + oneMinute)
      };
    }
    
    count += 1;
    await rateLimitRef.set({
      count,
      windowStart
    });
    
    return { allowed: true, timeRemaining: 0 };
  } catch (error) {
    console.error('Error checking 2B rate limit:', error);
    return { allowed: true, timeRemaining: 0 };
  }
}

// Sleep function for randomized delay
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Generate response using OpenAI with 2B's context
async function generateResponse(userMessage) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const { wordRange, systemPrompt, bio } = TWOB;
  
  // Build context-aware prompt
  const contextPrompt = `${systemPrompt}

DETAILED BIO FOR ACCURATE RESPONSES:
- Name: ${bio.fullName}
- Age: ${bio.age}, from ${bio.birthPlace}
- Education: ${bio.education}
- Location: ${bio.location}
- Personality: ${bio.personality}
- Interests: ${bio.interests.join(', ')}
- Speech Pattern: ${bio.speechPattern}
- Style: ${bio.personalStyle}`;
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: contextPrompt },
        { role: 'user', content: `Someone in the 67 room just said: "${userMessage}"\n\nRespond as 2B (sassy midwestern high school girl from Kansas, ultimate troll) with EXACTLY ${wordRange.min}-${wordRange.max} words. Be SAVAGE, SASSY, and TROLL THEM HARD. Maximum temperature energy - unpredictable and chaotic.` }
      ],
      temperature: 2.0, // MAX TEMPERATURE for maximum chaos and trolling
      max_tokens: 150,
      presence_penalty: 0.8,
      frequency_penalty: 0.7
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `OpenAI error: ${response.status}`);
  }

  const result = await response.json();
  let reply = (result.choices?.[0]?.message?.content || '').trim();
  
  // Remove quotes if present
  reply = reply.replace(/^["']|["']$/g, '').trim();
  
  // Validate word count
  const wordCount = reply.split(/\s+/).length;
  if (wordCount < wordRange.min || wordCount > wordRange.max) {
    reply = TWOB.fallbacks[Math.floor(Math.random() * TWOB.fallbacks.length)];
  }
  
  return reply;
}

// Post 2B's message to room67
async function post2BMessage(text, triggeredByMessage = null) {
  const { admin: firebaseAdmin, realtimeDb: db } = initFirebase();
  
  if (!db) {
    throw new Error('Firebase Realtime Database not available');
  }
  
  const serverTimestamp = firebaseAdmin.database.ServerValue.TIMESTAMP;
  
  // Update 2B's presence in room67
  await db.ref(`room67/users/${TWOB.id}`).set({
    name: TWOB.name,
    photoUrl: TWOB.photo,
    isAnonymous: false,
    isBot: true,
    verified: TWOB.verified,
    handle: TWOB.handle,
    profileId: TWOB.id,
    occupation: TWOB.occupation,
    location: TWOB.location,
    timestamp: serverTimestamp
  });

  const messagePayload = {
    userId: TWOB.id,
    profileId: TWOB.id,
    userName: TWOB.name,
    userPhoto: TWOB.photo,
    isAnonymous: false,
    isBot: true,
    verified: TWOB.verified,
    botHandle: TWOB.handle,
    text,
    timestamp: serverTimestamp,
    createdAt: serverTimestamp,
    persona: TWOB.id
  };

  if (triggeredByMessage) {
    messagePayload.respondingTo = {
      messageKey: triggeredByMessage.key,
      userName: triggeredByMessage.userName || 'Anonymous',
      textPreview: (triggeredByMessage.text || '').slice(0, 100)
    };
  }

  await db.ref('room67/messages').push(messagePayload);
  
  console.log(`✨ 2B has spoken:`, text);
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
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    console.log('💀 2B bot triggered');

    // 67% response rate - random chance to respond
    const shouldRespond = Math.random() < TWOB.responseRate;
    if (!shouldRespond) {
      console.log('🤷 2B decided to ignore this message (67% response rate)');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          action: 'ignored',
          message: '2B decided not to respond (67% response rate)' 
        })
      };
    }

    // Get the last message from room67
    const lastMessage = await getLastMessage();
    
    if (!lastMessage) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          action: 'no_message',
          message: 'No messages in room67 to respond to' 
        })
      };
    }

    // Check if 2B has already responded to this message
    const alreadyResponded = await has2BResponded(lastMessage.key);
    if (alreadyResponded) {
      console.log('⏭️ 2B already responded to message:', lastMessage.key);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          action: 'already_responded',
          message: '2B has already responded to this message',
          messageKey: lastMessage.key
        })
      };
    }
    
    console.log(`✨ 2B will respond to:`, {
      key: lastMessage.key,
      user: lastMessage.userName,
      textPreview: (lastMessage.text || '').slice(0, 50)
    });

    // Check rate limit (10 messages per minute)
    const rateLimit = await check2BRateLimit();
    if (!rateLimit.allowed) {
      console.log('⏸️ 2B rate limit reached. Taking a break.');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          action: 'rate_limited',
          message: '2B is taking a quick break (10 messages/minute limit)',
          timeRemaining: rateLimit.timeRemaining,
          resetTime: rateLimit.resetTime?.toISOString()
        })
      };
    }

    // Random delay between 1-5 seconds for natural conversation flow (2B is unpredictable)
    const delayMs = Math.floor(Math.random() * 4000) + 1000; // 1000-5000ms
    console.log(`⏳ 2B waiting ${(delayMs / 1000).toFixed(1)}s before responding...`);
    await sleep(delayMs);

    // Generate response
    const twoBResponse = await generateResponse(lastMessage.text || '');
    
    // Post 2B's message
    await post2BMessage(twoBResponse, lastMessage);
    
    // Mark as responded
    await mark2BResponded(lastMessage.key);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        action: 'responded',
        character: '2B',
        response: twoBResponse,
        respondingTo: {
          user: lastMessage.userName,
          text: (lastMessage.text || '').slice(0, 100)
        }
      })
    };

  } catch (error) {
    console.error('❌ 2B bot error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: '2B bot error',
        message: error.message
      })
    };
  }
};


