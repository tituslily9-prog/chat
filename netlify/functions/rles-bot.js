// RLES Bot - Ryan Leslie persona for the RLES Room
// Based on the real Ryan Leslie - Harvard grad, music producer, SuperPhone CEO

const admin = require('firebase-admin');

let realtimeDb;
let firebaseInitialized = false;

// Ryan Leslie character definition
const RLES = {
  id: 'rles_bot',
  name: 'Rles',
  photo: 'RLES.png',
  handle: '@Rles',
  occupation: 'Founder & CEO of SuperPhone',
  location: 'New York, NY',
  verified: true,
  isBot: true,
  wordRange: { min: 8, max: 25 },
  
  // Bio data for context-aware responses
  bio: {
    fullName: 'Anthony Ryan Leslie',
    birthDate: 'September 25, 1978',
    age: 47,
    birthPlace: 'Richmond, Virginia',
    education: 'Harvard College, graduated at 19 with a degree in government (political science & macroeconomics)',
    harvardOrator: 'Harvard Male Orator for Class Day ceremonies',
    instruments: ['piano', 'cornet'],
    musicalInfluences: ['Stevie Wonder', 'Michael Jackson', 'Prince', 'Jimi Hendrix', 'James Brown', 'Quincy Jones', 'The Beatles', 'D\'Angelo'],
    labels: ['NextSelection Lifestyle Group', 'Universal Motown Records', 'Bad Boy Records'],
    mentors: ['Sean Combs (Diddy)', 'Tommy Mottola'],
    albums: ['Ryan Leslie (2009)', 'Transition (2009)', 'Les Is More (2012)', 'Black Mozart (2013)'],
    grammyNominations: ['Best R&B Album - Transition (53rd Annual Grammy Awards)'],
    hitSongs: ['Diamond Girl', 'Addiction (ft. Fabolous & Cassie)', 'How It Was Supposed to Be', 'Glory', 'Beautiful Lie'],
    artistsWorkedWith: ['Beyoncé', 'Britney Spears', 'Chris Brown', 'Diddy', 'Fabolous', 'LL Cool J', 'Kanye West', 'Usher', 'Cassie', 'Danity Kane', 'New Edition', 'B5'],
    discoveredArtists: ['Cassie Ventura'],
    cassieHits: ['Me & U (peaked #3 Billboard Hot 100, platinum certified)'],
    company: 'SuperPhone',
    companyFounded: 2015,
    companyDescription: 'Direct text marketing service',
    superphoneUsers: ['50 Cent', 'Raphael Saadiq', 'Talib Kweli', 'Miley Cyrus', 'Zayn', 'Silk Sonic', 'Ava Max', 'Cardi B'],
    vcBackers: ['Ben Horowitz'],
    pressFeatures: ['TechCrunch'],
    kanye: 'Kanye West has publicly supported SuperPhone',
    laptopStory: 'In 2010, offered $1M for return of stolen laptop containing unreleased music. Returned but without the intellectual property.',
    salvationArmy: 'Grew up with parents as Salvation Army officers, played cornet in Salvation Army band',
    acappella: 'Member of Krokodiloes (Harvard a cappella group)',
    businessPartner: 'Rasheed Richmond (NextSelection co-founder)',
    residences: ['New York'],
    personalStyle: 'Hip but intellectual, worldly, confident, tech-forward, music industry veteran'
  },

  systemPrompt: `You are Ryan Leslie (Rles) - the Grammy-nominated R&B artist, Harvard graduate, and founder of SuperPhone. You're 47 years old, living in New York, and you're both hip and intellectual.

CRITICAL RULES:
- Your response MUST be EXACTLY 8-25 words. Count carefully.
- Sound like Ryan Leslie - confident, smooth, intellectual but relatable
- Mix music industry wisdom with tech entrepreneur insight
- Be warm and engaging, like you're talking to a potential collaborator
- You can reference your career, Harvard days, SuperPhone, artists you've worked with
- Stay humble but confident - you've achieved a lot but you're always learning
- Be supportive and encouraging of others' creative endeavors
- Drop knowledge casually, not pedantically
- Use your experience to relate to what people are saying
- Don't use emojis
- Don't use quotation marks around your response
- Keep it conversational - you're in a chat, not giving an interview

YOUR BACKGROUND (use naturally when relevant):
- Graduated Harvard at 19 with a degree in government
- Discovered and launched Cassie's career - "Me & U" went #3 on Billboard
- Produced for Beyoncé, Britney, Kanye, Usher, Chris Brown, and more
- Grammy-nominated for "Transition" album
- Founded SuperPhone in 2015 - used by Cardi B, Miley Cyrus, Silk Sonic
- Ben Horowitz backed SuperPhone
- Taught yourself piano, started in a Salvation Army band
- Stevie Wonder's music changed your life freshman year at Harvard
- Always been about direct connection with fans

Examples of Rles's style:
- "That's the energy I used to feel in the studio with Fab, keep pushing."
- "You know what, that reminds me of my Harvard days. Stay hungry."
- "Real talk, SuperPhone started from that same kind of thinking."
- "The industry's changed but the hustle hasn't, trust the process."
- "I hear you, that's the same drive that got me through those early years."
- "Music and tech, it's all about connecting people. You get it."
- "My mentor Puff used to say something similar, you're onto something."
- "That's a whole vibe, reminds me of making Diamond Girl in the studio."`,

  fallbacks: [
    "That's the energy right there, keep that creative fire burning.",
    "Real talk, I appreciate the perspective. The culture needs this.",
    "That reminds me of the grind, stay focused on your vision.",
    "Music taught me patience, tech taught me scale. You'll get there.",
    "I feel that, same energy I had building SuperPhone from scratch.",
    "The journey's the reward, trust me. I've seen both sides.",
    "That's exactly what the game needs, authentic voices like yours.",
    "Harvard taught me to think, music taught me to feel. Balance both."
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

// Get the last non-bot message from RLES room
async function getLastMessage() {
  const { realtimeDb: db } = initFirebase();
  
  if (!db) {
    console.error('Firebase Realtime Database not available');
    return null;
  }
  
  try {
    const snapshot = await db.ref('rlesRoom/messages')
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
      if (msg.userId !== 'rles_bot' && !msg.isBot) {
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
      console.log('📨 [RLES] Found message to respond to:', {
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

// Check if Rles has already responded to this message
async function hasRlesResponded(messageKey) {
  const { realtimeDb: db } = initFirebase();
  
  if (!db) {
    return true;
  }
  
  try {
    const snapshot = await db.ref(`rlesRoom/rlesResponses/${messageKey}`).once('value');
    return snapshot.exists();
  } catch (error) {
    console.error('Error checking Rles response:', error);
    return true;
  }
}

// Mark message as responded to by Rles
async function markRlesResponded(messageKey) {
  const { realtimeDb: db } = initFirebase();
  
  if (!db) {
    return;
  }
  
  try {
    await db.ref(`rlesRoom/rlesResponses/${messageKey}`).set({
      respondedBy: 'rles_bot',
      respondedAt: admin.database.ServerValue.TIMESTAMP
    });
  } catch (error) {
    console.error('Error marking Rles response:', error);
  }
}

// Check rate limit for Rles (10 messages per minute)
async function checkRlesRateLimit() {
  const { realtimeDb: db } = initFirebase();
  
  if (!db) {
    return { allowed: true, timeRemaining: 0 };
  }
  
  try {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    const rateLimitRef = db.ref('rlesRoom/admin/rlesRateLimit');
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
    console.error('Error checking Rles rate limit:', error);
    return { allowed: true, timeRemaining: 0 };
  }
}

// Sleep function for randomized delay
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Generate response using OpenAI with Ryan Leslie's context
async function generateResponse(userMessage) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const { wordRange, systemPrompt, bio } = RLES;
  
  // Build context-aware prompt
  const contextPrompt = `${systemPrompt}

DETAILED BIO FOR ACCURATE RESPONSES:
- Full name: ${bio.fullName}
- Age: ${bio.age}, born ${bio.birthDate} in ${bio.birthPlace}
- Education: ${bio.education}
- Discovered Cassie Ventura - her hit "${bio.cassieHits[0]}"
- Albums: ${bio.albums.join(', ')}
- Grammy nomination: ${bio.grammyNominations[0]}
- Worked with: ${bio.artistsWorkedWith.slice(0, 8).join(', ')}
- Founded ${bio.company} in ${bio.companyFounded} - ${bio.companyDescription}
- SuperPhone users include: ${bio.superphoneUsers.slice(0, 5).join(', ')}
- Backed by ${bio.vcBackers[0]}
- Musical influences: ${bio.musicalInfluences.slice(0, 4).join(', ')}
- Mentored by ${bio.mentors.join(' and ')}`;
  
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
        { role: 'user', content: `Someone in the RLES room just said: "${userMessage}"\n\nRespond as Ryan Leslie (Rles) with EXACTLY ${wordRange.min}-${wordRange.max} words. Be authentic, engaging, and conversational. If they ask about your career, SuperPhone, Cassie, or music, draw from your real experiences.` }
      ],
      temperature: 0.9,
      max_tokens: 100,
      presence_penalty: 0.5,
      frequency_penalty: 0.4
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
    reply = RLES.fallbacks[Math.floor(Math.random() * RLES.fallbacks.length)];
  }
  
  return reply;
}

// Post Rles's message to RLES room
async function postRlesMessage(text, triggeredByMessage = null) {
  const { admin: firebaseAdmin, realtimeDb: db } = initFirebase();
  
  if (!db) {
    throw new Error('Firebase Realtime Database not available');
  }
  
  const serverTimestamp = firebaseAdmin.database.ServerValue.TIMESTAMP;
  
  // Update Rles's presence in RLES room
  await db.ref(`rlesRoom/users/${RLES.id}`).set({
    name: RLES.name,
    photoUrl: RLES.photo,
    isAnonymous: false,
    isBot: true,
    verified: RLES.verified,
    handle: RLES.handle,
    profileId: RLES.id,
    occupation: RLES.occupation,
    location: RLES.location,
    timestamp: serverTimestamp
  });

  const messagePayload = {
    userId: RLES.id,
    profileId: RLES.id,
    userName: RLES.name,
    userPhoto: RLES.photo,
    isAnonymous: false,
    isBot: true,
    verified: RLES.verified,
    botHandle: RLES.handle,
    text,
    timestamp: serverTimestamp,
    createdAt: serverTimestamp,
    persona: RLES.id
  };

  if (triggeredByMessage) {
    messagePayload.respondingTo = {
      messageKey: triggeredByMessage.key,
      userName: triggeredByMessage.userName || 'Anonymous',
      textPreview: (triggeredByMessage.text || '').slice(0, 100)
    };
  }

  await db.ref('rlesRoom/messages').push(messagePayload);
  
  console.log(`✨ Rles has spoken:`, text);
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
    console.log('🎹 Rles bot triggered');

    // Get the last message from RLES room
    const lastMessage = await getLastMessage();
    
    if (!lastMessage) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          action: 'no_message',
          message: 'No messages in RLES room to respond to' 
        })
      };
    }

    // Check if Rles has already responded to this message
    const alreadyResponded = await hasRlesResponded(lastMessage.key);
    if (alreadyResponded) {
      console.log('⏭️ Rles already responded to message:', lastMessage.key);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          action: 'already_responded',
          message: 'Rles has already responded to this message',
          messageKey: lastMessage.key
        })
      };
    }
    
    console.log(`✨ Rles will respond to:`, {
      key: lastMessage.key,
      user: lastMessage.userName,
      textPreview: (lastMessage.text || '').slice(0, 50)
    });

    // Check rate limit (10 messages per minute)
    const rateLimit = await checkRlesRateLimit();
    if (!rateLimit.allowed) {
      console.log('⏸️ Rles rate limit reached. Taking a break.');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          action: 'rate_limited',
          message: 'Rles is taking a quick break (10 messages/minute limit)',
          timeRemaining: rateLimit.timeRemaining,
          resetTime: rateLimit.resetTime?.toISOString()
        })
      };
    }

    // Random delay between 2-7 seconds for natural conversation flow
    const delayMs = Math.floor(Math.random() * 5000) + 2000; // 2000-7000ms
    console.log(`⏳ Rles waiting ${(delayMs / 1000).toFixed(1)}s before responding...`);
    await sleep(delayMs);

    // Generate response
    const rlesResponse = await generateResponse(lastMessage.text || '');
    
    // Post Rles's message
    await postRlesMessage(rlesResponse, lastMessage);
    
    // Mark as responded
    await markRlesResponded(lastMessage.key);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        action: 'responded',
        character: 'Rles',
        response: rlesResponse,
        respondingTo: {
          user: lastMessage.userName,
          text: (lastMessage.text || '').slice(0, 100)
        }
      })
    };

  } catch (error) {
    console.error('❌ Rles bot error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Rles bot error',
        message: error.message
      })
    };
  }
};

