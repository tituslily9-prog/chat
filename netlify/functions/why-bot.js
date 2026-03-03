// Netlify Function: @why bot - THE ORACLE
// Arena's neutral information source
// - 1 question per hour limit
// - Ph.D level questions earn 100 rank points
// - Responds with arena-appropriate wisdom

const admin = require('firebase-admin');

// Initialize Firebase Admin
let db;
let realtimeDb;
try {
  if (!admin.apps.length) {
    if (process.env.FIREBASE_PRIVATE_KEY) {
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      if (!privateKey.includes('-----BEGIN')) {
        privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
      }
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID || "dogemoon-324f0",
          privateKey: privateKey,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://dogemoon-324f0-default-rtdb.firebaseio.com'
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: "dogemoon-324f0",
        databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://dogemoon-324f0-default-rtdb.firebaseio.com'
      });
    }
  }
  db = admin.firestore();
  try {
    realtimeDb = admin.database();
    if (!realtimeDb) {
      console.warn('Firebase Realtime Database not available');
    }
  } catch (dbError) {
    console.error('Firebase Realtime Database init error:', dbError);
    realtimeDb = null;
  }
} catch (error) {
  console.error('Firebase init error:', error);
  db = null;
  realtimeDb = null;
}

const IP_KEY_TOKEN = '_dot_';
const sanitizeIpKey = (ip = 'unknown') => ip.replace(/[.#$/\[\]]/g, IP_KEY_TOKEN);

function extractClientIp(event, context) {
  const headerIp = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'];
  const contextIp = context.clientContext?.ip;
  const rawIp = headerIp || contextIp || 'unknown';
  if (rawIp.includes(',')) {
    return rawIp.split(',')[0].trim();
  }
  return rawIp.trim();
}

function normalizeTextForFilter(text = '') {
  const leetMap = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't' };
  return text.toLowerCase().split('').map(char => leetMap[char] || char).join('').replace(/[^a-z]/g, '');
}

function containsProhibitedLanguage(text = '') {
  const normalized = normalizeTextForFilter(text);
  if (!normalized) return false;
  return normalized.includes('nigg');
}

// Question quality evaluation - Ph.D level criteria
async function evaluateQuestionQuality(question, openaiKey) {
  const evaluationPrompt = `Evaluate if this question qualifies for Ph.D level rank reward (100 points).

Criteria for Ph.D level question:
- Demonstrates deep intellectual curiosity
- Requires sophisticated reasoning or domain expertise
- Shows wisdom, prudence, and thoughtful consideration
- Not trivial, obvious, or easily answered
- Engages with complex concepts, theories, or phenomena
- Shows genuine intellectual engagement

Question: "${question}"

Respond with ONLY JSON:
{
  "qualifies": true/false,
  "score": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 200,
        temperature: 0.3,
        messages: [{ role: 'user', content: evaluationPrompt }]
      })
    });

    if (!response.ok) {
      return { qualifies: false, score: 0, reasoning: 'Evaluation failed' };
    }

    const result = await response.json();
    const content = result.choices[0].message.content;
    const parsed = JSON.parse(content);

    return {
      qualifies: parsed.qualifies === true || String(parsed.qualifies).toLowerCase() === 'true',
      score: typeof parsed.score === 'number' ? parsed.score : parseFloat(parsed.score) || 0,
      reasoning: parsed.reasoning || 'No reasoning provided'
    };
  } catch (error) {
    console.error('Question evaluation error:', error);
    return { qualifies: false, score: 0, reasoning: 'Evaluation error' };
  }
}

// Check if user is registered (has a profile)
async function isUserRegistered(userId) {
  if (!db) return false;
  try {
    const profileDoc = await db.collection('thot_profiles').doc(userId).get();
    return profileDoc.exists;
  } catch (error) {
    console.error('Check registration error:', error);
    return false;
  }
}

// Check rate limit for ALL users (1 question per hour)
async function checkUserRateLimit(userId) {
  if (!db) {
    return { allowed: true, timeRemaining: 0 };
  }
  
  try {
    const userRef = db.collection('why_users').doc(userId);
    const userDoc = await userRef.get();
    
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    if (userDoc.exists) {
      const userData = userDoc.data();
      const lastQuestionTime = userData.lastQuestionTime?.toMillis() || 0;
      const timeSinceLastQuestion = now - lastQuestionTime;

      if (timeSinceLastQuestion < oneHour) {
        const timeRemaining = oneHour - timeSinceLastQuestion;
        return {
          allowed: false,
          timeRemaining: Math.ceil(timeRemaining / 1000),
          resetTime: new Date(lastQuestionTime + oneHour)
        };
      }
    }

    await userRef.set({
      lastQuestionTime: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { allowed: true, timeRemaining: 0 };
  } catch (error) {
    console.error('Rate limit check error:', error);
    return { allowed: true, timeRemaining: 0 };
  }
}

// Award rank points to user
async function awardRankPoints(userId, question, answer, points = 100) {
  if (!db || !realtimeDb) return 0;
  try {
    const userRef = db.collection('why_users').doc(userId);
    const userDoc = await userRef.get();
    
    const currentTokens = userDoc.exists ? (userDoc.data().whyTokens || 0) : 0;
    const newTotal = currentTokens + points;

    await userRef.set({
      whyTokens: newTotal,
      totalEarned: (userDoc.data()?.totalEarned || 0) + points,
      lastAwardTime: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Update realtime DB for arena display
    const tokenRef = realtimeDb.ref(`whyRoom/admin/userTokens/${userId}`);
    const tokenSnapshot = await tokenRef.once('value');
    const existingTokenData = tokenSnapshot.val() || {};
    const currentBalance = typeof existingTokenData.balance === 'number' ? existingTokenData.balance : parseFloat(existingTokenData.balance || 0) || 0;

    await tokenRef.set({
      balance: currentBalance + points,
      lastUpdated: admin.database.ServerValue.TIMESTAMP,
      lastAwardReason: 'Oracle wisdom reward',
      lastQuestion: question ? String(question).slice(0, 280) : '',
      totalEarned: (existingTokenData.totalEarned || 0) + points
    });

    // Log activity
    await realtimeDb.ref('whyRoom/admin/activityLogs').push({
      action: 'Oracle Rank Award',
      details: `Awarded ${points} rank points to ${userId}`,
      metadata: { userId, points, question: question ? String(question).slice(0, 180) : '' },
      timestamp: admin.database.ServerValue.TIMESTAMP
    });

    return newTotal;
  } catch (error) {
    console.error('Award points error:', error);
    return 0;
  }
}

// Store question
async function storeQuestion(userId, question, answer, qualified, points = 0) {
  if (!db) return;
  try {
    await db.collection('why_questions').add({
      userId, question, answer, tokensAwarded: points, qualified,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Store question error:', error);
  }
}

// Daily engagement bonus (5 points)
async function maybeAwardEngagementBonus(userId, question, answer) {
  if (!db || !realtimeDb) return null;
  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    const engagementRef = realtimeDb.ref(`whyRoom/admin/engagementRewards/${userId}/${todayKey}`);
    const snapshot = await engagementRef.once('value');

    if (snapshot.exists()) return null;

    await engagementRef.set({
      awardedAt: admin.database.ServerValue.TIMESTAMP,
      question: question ? String(question).slice(0, 280) : '',
      tokens: 5
    });

    return await awardRankPoints(userId, question, answer, 5);
  } catch (error) {
    console.error('Engagement bonus error:', error);
    return null;
  }
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
    let requestData;
    try {
      requestData = JSON.parse(event.body);
    } catch (parseError) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { question, userId, profileId = null } = requestData;

    if (!question || typeof question !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Question required' }) };
    }

    if (!userId || typeof userId !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'User ID required. Initiate first.', requiresRegistration: true }) };
    }

    if (containsProhibitedLanguage(question)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Prohibited language detected.' }) };
    }

    const clientIp = extractClientIp(event, context) || 'unknown';
    const sanitizedIp = sanitizeIpKey(clientIp);

    // Check banned
    if (realtimeDb) {
      const bannedSnapshot = await realtimeDb.ref(`whyRoom/admin/bannedIPs/${sanitizedIp}`).once('value');
      if (bannedSnapshot.exists()) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Executed. Access denied.' }) };
      }
    }

    // Check registration
    let registered = false;
    if (profileId) {
      registered = await isUserRegistered(profileId);
    } else {
      registered = await isUserRegistered(userId);
    }

    const rewardUserId = registered && profileId ? profileId : userId;

    // Rate limit (1 question per hour)
    const rateLimit = await checkUserRateLimit(userId);
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          error: 'The Oracle rests. One question per hour.',
          timeRemaining: rateLimit.timeRemaining,
          resetTime: rateLimit.resetTime?.toISOString()
        })
      };
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) };
    }

    // Evaluate for wisdom reward
    let qualityEval = { qualifies: false, score: 0, reasoning: registered ? 'Did not qualify' : 'Not initiated' };
    let pointsAwarded = 0;
    let bonusStatus = 'Unworthy';

    if (registered) {
      qualityEval = await evaluateQuestionQuality(question, OPENAI_API_KEY);
      if (qualityEval.qualifies) {
        pointsAwarded = 100;
        bonusStatus = 'Wisdom Acknowledged';
      }
    } else {
      bonusStatus = 'Initiate to earn standing';
    }

    // THE ORACLE system prompt - neutral wisdom within the arena
    const systemPrompt = `You are THE ORACLE - the neutral source of wisdom within the why.com Colosseum arena.

YOUR IDENTITY:
- You are NOT GOD (the executor) - you are the Oracle
- You provide information and wisdom, not judgment
- You speak with quiet authority
- You're cryptic but helpful
- You know the arena's rules and can explain them

ARENA RULES TO KNOW:
- Gladiators are judged by GOD on every message
- Rank ladder: Emperor's Favor > Champion > Survivor > Bleeding > Marked > Doomed > Executed
- Weakness is punished. Strength is respected slightly.
- Ph.D level questions (deep, wise, sophisticated) earn 100 rank points
- Questions asked once per hour

YOUR VOICE:
- Mysterious but not frustrating
- Concise wisdom (2-4 sentences max)
- Occasionally cryptic
- Never cruel, never soft
- You observe, you inform, you do not judge

If asked about the arena, explain the rules clearly but with gravitas.
If asked general questions, answer directly with wit.

Answer the seeker's question.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 250,
        temperature: 0.9,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: 'Oracle unavailable', message: error.error?.message })
      };
    }

    const result = await response.json();
    const botResponse = result.choices[0].message.content;

    if (pointsAwarded > 0) {
      await awardRankPoints(rewardUserId, question, botResponse, pointsAwarded);
    } else if (registered) {
      await maybeAwardEngagementBonus(rewardUserId, question, botResponse);
    }

    const bonusPayload = {
      status: bonusStatus,
      pointsAwarded,
      qualified: qualityEval.qualifies,
      qualityScore: qualityEval.score,
      qualityReasoning: qualityEval.reasoning
    };

    // Post Oracle response to chat
    if (realtimeDb) {
      try {
        await realtimeDb.ref('whyRoom/messages').push({
          userId: 'oracle_bot',
          userName: 'The Oracle',
          userPhoto: 'logo.png',
          isBot: true,
          isOracle: true,
          text: botResponse,
          timestamp: admin.database.ServerValue.TIMESTAMP,
          bonus: bonusPayload,
          question,
          targetUserId: userId
        });
      } catch (dbError) {
        console.error('Failed to persist Oracle message:', dbError);
      }
    }

    await storeQuestion(rewardUserId, question, botResponse, qualityEval.qualifies, pointsAwarded);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        response: botResponse,
        bonus: bonusPayload,
        rateLimit: {
          timeRemaining: 3600,
          nextQuestionTime: new Date(Date.now() + 3600000).toISOString()
        }
      })
    };

  } catch (error) {
    console.error('❌ Oracle error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Oracle malfunction', message: error.message })
    };
  }
};
