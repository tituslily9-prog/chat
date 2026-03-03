const admin = require('firebase-admin');

let appInitialized = false;
let realtimeDb;

function initializeFirebase() {
  if (appInitialized) return;

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
        databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://dogemoon-324f0-default-rtdb.firebaseio.com'
      });
    }
  }

  realtimeDb = admin.database();
  appInitialized = true;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const PROHIBITED_SUBSTRING = 'nigg';
const IP_KEY_TOKEN = '_dot_';

const SPAM_PROTECTION = {
  maxRepeatedChars: 20,
  maxEmojiRun: 100,
  maxEmojiTotal: 120,
  repeatedCharUniqueThreshold: 2,
  repeatedCharMinLength: 30,
  repeatedWordThreshold: 10,
  maxMessageLength: 140, // Maximum characters per message (Twitter-style limit)
  rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes window
  rateLimitMaxMessages: 50, // 50 messages per 15 minutes
  burstWindowMs: 10 * 1000, // 10 seconds
  burstMaxMessages: 5, // max 5 messages in 10 seconds (stops rapid spam)
  timeoutDurationMs: 30 * 60 * 1000,
  anonymousMessageLimit: 3,
  anonymousWindowMs: 24 * 60 * 60 * 1000,
  // Progressive penalty system
  progressivePenalties: {
    firstOffense: 30 * 60 * 1000,      // 30 minutes
    secondOffense: 2 * 60 * 60 * 1000, // 2 hours
    thirdOffense: 24 * 60 * 60 * 1000, // 24 hours
    fourthPlusOffense: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
};

const REPEATED_CHAR_REGEX = /(.)\1{19,}/u; // 20 of the same char
const EMOJI_GLOBAL_REGEX = /[\p{Extended_Pictographic}\uFE0F]/gu;
const EMOJI_SINGLE_REGEX = /[\p{Extended_Pictographic}\uFE0F]/u;

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
  return normalized.includes(PROHIBITED_SUBSTRING);
}

function hasExcessiveRepeatedChars(text = '') {
  if (!text) return false;
  if (REPEATED_CHAR_REGEX.test(text)) {
    return true;
  }

  const condensed = text.replace(/\s+/g, '');
  if (condensed.length >= SPAM_PROTECTION.repeatedCharMinLength) {
    const uniqueChars = new Set(Array.from(condensed));
    if (uniqueChars.size <= SPAM_PROTECTION.repeatedCharUniqueThreshold) {
      return true;
    }
  }

  return false;
}

function hasEmojiFlood(text = '') {
  if (!text) return false;

  const emojiMatches = text.match(EMOJI_GLOBAL_REGEX);
  if (emojiMatches && emojiMatches.length >= SPAM_PROTECTION.maxEmojiTotal) {
    return true;
  }

  let longestRun = 0;
  let currentRun = 0;
  let currentEmoji = '';
  let currentEmojiRun = 0;

  for (const char of Array.from(text)) {
    if (EMOJI_SINGLE_REGEX.test(char)) {
      if (char === currentEmoji) {
        currentEmojiRun += 1;
      } else {
        currentEmoji = char;
        currentEmojiRun = 1;
      }

      currentRun += 1;
      if (currentRun > longestRun) {
        longestRun = currentRun;
      }
      if (longestRun >= SPAM_PROTECTION.maxEmojiRun || currentEmojiRun >= SPAM_PROTECTION.maxEmojiRun) {
        return true;
      }
    } else if (!/\s/.test(char)) {
      currentRun = 0;
      currentEmojiRun = 0;
      currentEmoji = '';
    } else {
      currentRun = 0;
      currentEmojiRun = 0;
      currentEmoji = '';
    }
  }

  return false;
}

function hasRepeatedWords(text = '') {
  if (!text) return false;

  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return false;

  let currentWord = tokens[0];
  let currentCount = 1;

  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === currentWord) {
      currentCount += 1;
      if (currentCount >= SPAM_PROTECTION.repeatedWordThreshold) {
        return true;
      }
    } else {
      currentWord = tokens[i];
      currentCount = 1;
    }
  }

  return false;
}

function detectSpammyContent(text = '') {
  if (!text) return null;

  if (hasExcessiveRepeatedChars(text)) {
    return 'Message blocked: excessive repeated characters detected.';
  }

  if (hasEmojiFlood(text)) {
    return 'Message blocked: emoji spam detected.';
  }

  if (hasRepeatedWords(text)) {
    return 'Message blocked: repeated words detected.';
  }

  return null;
}

async function logAdminEvent(action, details, metadata = {}, room = 'whyRoom') {
  try {
    await realtimeDb.ref(`${room}/admin/activityLogs`).push({
      action,
      details,
      metadata,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
  } catch (logError) {
    console.error('Failed to log admin event:', logError);
  }
}

async function checkActiveTimeout(userId, room = 'whyRoom') {
  const timeoutRef = realtimeDb.ref(`${room}/admin/userTimeouts/${userId}`);
  const snapshot = await timeoutRef.once('value');
  const timeoutData = snapshot.val();

  if (!timeoutData) {
    return null;
  }

  const now = Date.now();
  const expiresAt = typeof timeoutData.expiresAt === 'number' ? timeoutData.expiresAt : 0;

  if (expiresAt && expiresAt > now) {
    return { expiresAt, ref: timeoutRef };
  }

  // Expired timeout - clean up
  await timeoutRef.remove().catch((err) => {
    console.error('Failed to clear expired timeout:', err);
  });
  return null;
}

// Check if user is sending a duplicate message (same as their last message)
async function checkDuplicateMessage(userId, messageText, room = 'whyRoom') {
  try {
    if (!realtimeDb) {
      return { isDuplicate: false };
    }

    // Get the last 10 messages from this user in this room
    const messagesSnapshot = await realtimeDb.ref(`${room}/messages`)
      .orderByChild('userId')
      .equalTo(userId)
      .limitToLast(10)
      .once('value');

    if (!messagesSnapshot.exists()) {
      return { isDuplicate: false };
    }

    // Find the most recent message from this user
    let lastMessage = null;
    let lastTimestamp = 0;

    messagesSnapshot.forEach((child) => {
      const msg = child.val();
      const msgTime = typeof msg.timestamp === 'number' ? msg.timestamp : (msg.timestamp?.valueOf?.() || 0);
      if (msgTime > lastTimestamp && msg.text) {
        lastTimestamp = msgTime;
        lastMessage = msg;
      }
    });

    if (!lastMessage || !lastMessage.text) {
      return { isDuplicate: false };
    }

    // Compare messages (case-insensitive, trimmed)
    const normalizedNew = messageText.trim().toLowerCase();
    const normalizedLast = (lastMessage.text || '').trim().toLowerCase();

    if (normalizedNew === normalizedLast) {
      return {
        isDuplicate: true,
        lastMessageText: lastMessage.text,
        lastMessageTime: lastTimestamp
      };
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error('Error checking duplicate message:', error);
    // Don't block on error, allow the message
    return { isDuplicate: false };
  }
}

async function ensureAnonymousAllowance(userId, room = 'whyRoom') {
  const now = Date.now();
  const windowMs = SPAM_PROTECTION.anonymousWindowMs;
  const limit = SPAM_PROTECTION.anonymousMessageLimit;

  const anonRef = realtimeDb.ref(`${room}/admin/anonymousCounters/${userId}`);
  const snapshot = await anonRef.once('value');
  const data = snapshot.val() || {};

  let windowStart = typeof data.windowStart === 'number' ? data.windowStart : 0;
  let count = typeof data.count === 'number' ? data.count : 0;

  if (!windowStart || now - windowStart > windowMs) {
    windowStart = now;
    count = 0;
  }

  if (count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  count += 1;
  await anonRef.set({
    count,
    windowStart,
    lastMessageAt: admin.database.ServerValue.TIMESTAMP
  });

  return {
    allowed: true,
    remaining: Math.max(0, limit - count)
  };
}

// Get progressive penalty duration based on offense count
async function getProgressivePenalty(userId, room = 'whyRoom') {
  const penaltyRef = realtimeDb.ref(`${room}/admin/userPenalties/${userId}`);
  const snapshot = await penaltyRef.once('value');
  const penaltyData = snapshot.val() || {};
  
  const offenseCount = typeof penaltyData.count === 'number' ? penaltyData.count : 0;
  
  if (offenseCount === 0) {
    return SPAM_PROTECTION.progressivePenalties.firstOffense;
  } else if (offenseCount === 1) {
    return SPAM_PROTECTION.progressivePenalties.secondOffense;
  } else if (offenseCount === 2) {
    return SPAM_PROTECTION.progressivePenalties.thirdOffense;
  } else {
    return SPAM_PROTECTION.progressivePenalties.fourthPlusOffense;
  }
}

// Increment penalty count for user
async function incrementPenaltyCount(userId, room = 'whyRoom') {
  const penaltyRef = realtimeDb.ref(`${room}/admin/userPenalties/${userId}`);
  const snapshot = await penaltyRef.once('value');
  const penaltyData = snapshot.val() || {};
  const currentCount = typeof penaltyData.count === 'number' ? penaltyData.count : 0;
  
  await penaltyRef.set({
    count: currentCount + 1,
    lastOffenseAt: admin.database.ServerValue.TIMESTAMP
  });
  
  return currentCount + 1;
}

// Check fingerprint-based rate limiting
async function checkFingerprintRateLimit(fingerprint, clientIp, room = 'whyRoom') {
  const now = Date.now();
  const fingerprintRef = realtimeDb.ref(`${room}/admin/fingerprintRate/${fingerprint}`);
  const snapshot = await fingerprintRef.once('value');
  const rateData = snapshot.val() || {};

  const windowStart = typeof rateData.windowStart === 'number' ? rateData.windowStart : 0;
  let count = typeof rateData.count === 'number' ? rateData.count : 0;

  // Reset window if expired (15 minutes)
  if (!windowStart || now - windowStart > SPAM_PROTECTION.rateLimitWindowMs) {
    await fingerprintRef.set({
      count: 1,
      windowStart: now
    });
    return null;
  }

  count += 1;

  if (count >= SPAM_PROTECTION.rateLimitMaxMessages) {
    // Calculate time remaining until window resets
    const windowEnd = windowStart + SPAM_PROTECTION.rateLimitWindowMs;
    const timeRemaining = Math.max(0, windowEnd - now);
    const minutesRemaining = Math.ceil(timeRemaining / 60000);
    
    return { 
      blocked: true, 
      timeRemaining: timeRemaining,
      minutesRemaining: minutesRemaining,
      resetTime: new Date(windowEnd)
    };
  }

  await fingerprintRef.set({ count, windowStart });
  return null;
}

// Burst limit: max N messages per short window (e.g. 8 per minute) to stop 25x in a row
async function checkBurstLimit(userId, room = 'whyRoom') {
  const now = Date.now();
  const burstRef = realtimeDb.ref(`${room}/admin/userBurst/${userId}`);
  const snapshot = await burstRef.once('value');
  const data = snapshot.val() || {};

  const windowStart = typeof data.windowStart === 'number' ? data.windowStart : 0;
  let count = typeof data.count === 'number' ? data.count : 0;

  if (!windowStart || now - windowStart > SPAM_PROTECTION.burstWindowMs) {
    await burstRef.set({ count: 1, windowStart: now });
    return null;
  }

  count += 1;
  if (count > SPAM_PROTECTION.burstMaxMessages) {
    const windowEnd = windowStart + SPAM_PROTECTION.burstWindowMs;
    const waitSec = Math.ceil((windowEnd - now) / 1000);
    return { blocked: true, waitSec, windowEnd };
  }

  await burstRef.set({ count, windowStart });
  return null;
}

async function applyRateLimit(userId, clientIp, room = 'whyRoom') {
  const now = Date.now();
  const rateRef = realtimeDb.ref(`${room}/admin/userRate/${userId}`);
  const snapshot = await rateRef.once('value');
  const rateData = snapshot.val() || {};

  const windowStart = typeof rateData.windowStart === 'number' ? rateData.windowStart : 0;
  let count = typeof rateData.count === 'number' ? rateData.count : 0;

  // Reset window if expired (15 minutes)
  if (!windowStart || now - windowStart > SPAM_PROTECTION.rateLimitWindowMs) {
    await rateRef.set({
      count: 1,
      windowStart: now
    });
    return null;
  }

  count += 1;

  if (count >= SPAM_PROTECTION.rateLimitMaxMessages) {
    // Calculate time remaining until window resets (timer resets after 15 minutes)
    const windowEnd = windowStart + SPAM_PROTECTION.rateLimitWindowMs;
    const timeRemaining = Math.max(0, windowEnd - now);
    const minutesRemaining = Math.ceil(timeRemaining / 60000);
    
    // For repeat offenders, apply progressive penalty
    const penaltyDuration = await getProgressivePenalty(userId, room);
    const timeoutUntil = now + penaltyDuration;
    const timeoutRef = realtimeDb.ref(`${room}/admin/userTimeouts/${userId}`);

    // Increment penalty count
    const newOffenseCount = await incrementPenaltyCount(userId, room);

    await Promise.all([
      timeoutRef.set({
        expiresAt: timeoutUntil,
        reason: `Rate limit exceeded: ${SPAM_PROTECTION.rateLimitMaxMessages} messages/15min limit (offense #${newOffenseCount}). Timer resets in ${minutesRemaining} minute(s).`,
        createdAt: admin.database.ServerValue.TIMESTAMP,
        clientIp: clientIp || 'unknown'
      }),
      rateRef.set({ count, windowStart }) // Keep current count, don't reset
    ]);

    await logAdminEvent('Rate Limit Exceeded', `User ${userId} exceeded ${SPAM_PROTECTION.rateLimitMaxMessages} messages/15min (offense #${newOffenseCount})`, {
      timeoutUntil,
      penaltyDuration,
      timeRemaining,
      clientIp: clientIp || 'unknown'
    }, room);

    return { 
      timeoutUntil,
      timeRemaining,
      minutesRemaining,
      resetTime: new Date(windowEnd)
    };
  }

  await rateRef.set({ count, windowStart });
  return null;
}

function sanitizeIpKey(ip = 'unknown') {
  return ip.replace(/[.#$/\[\]]/g, IP_KEY_TOKEN);
}

// Extract IP subnet (/24) for proxy detection
function getIpSubnet(ip = 'unknown') {
  if (ip === 'unknown' || !ip.includes('.')) return 'unknown';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  return 'unknown';
}

function extractClientIp(event, context) {
  const headerIp = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'];
  const contextIp = context.clientContext?.ip;
  const rawIp = headerIp || contextIp || 'unknown';

  if (rawIp.includes(',')) {
    return rawIp.split(',')[0].trim();
  }

  return rawIp.trim();
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  initializeFirebase();

  try {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    const { text, userId, userName, userPhoto = '', isAnonymous = false, browserFingerprint = 'unknown', room = 'whyRoom', isReaction = false } = payload;
    
    // Validate room (only allow specific rooms)
    const validRooms = ['whyRoom', 'rlesRoom', 'room67'];
    const targetRoom = validRooms.includes(room) ? room : 'whyRoom';
    
    if (!text || typeof text !== 'string' || !text.trim()) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Message text is required' })
      };
    }
    
    // For reactions (single emoji), skip some spam checks but still apply rate limiting
    const isSingleEmoji = isReaction && text.trim().length <= 2 && /[\p{Extended_Pictographic}\uFE0F]/u.test(text.trim());

    // Check message length
    if (text.length > SPAM_PROTECTION.maxMessageLength) {
      await logAdminEvent('Length Block', `Blocked overly long message from ${userId}`, {
        length: text.length,
        maxLength: SPAM_PROTECTION.maxMessageLength,
        preview: text.slice(0, 160)
      }, targetRoom);
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ 
          error: `Message exceeds maximum length of ${SPAM_PROTECTION.maxMessageLength} characters.` 
        })
      };
    }

    if (!userId || typeof userId !== 'string') {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'User ID is required' })
      };
    }

    // --- Synchronous checks first (zero I/O) ---
    if (containsProhibitedLanguage(text)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Message contains prohibited language and was blocked.' })
      };
    }

    if (!isSingleEmoji) {
      const spamReason = detectSpammyContent(text);
      if (spamReason) {
        logAdminEvent('Spam Block', `Blocked spammy message from ${userId}`, {
          reason: spamReason,
          preview: text.slice(0, 160)
        }, targetRoom);
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: spamReason })
        };
      }
    }

    const clientIp = extractClientIp(event, context) || 'unknown';
    const sanitizedIp = sanitizeIpKey(clientIp);
    const ipSubnet = getIpSubnet(clientIp);
    const sanitizedFingerprint = browserFingerprint !== 'unknown' ? browserFingerprint.replace(/[.#$/\[\]]/g, IP_KEY_TOKEN) : 'unknown';

    // --- Parallel batch: all independent Firebase reads at once ---
    const parallelChecks = {};

    parallelChecks.timeout = checkActiveTimeout(userId, targetRoom);
    parallelChecks.duplicate = checkDuplicateMessage(userId, text.trim(), targetRoom);
    parallelChecks.burst = checkBurstLimit(userId, targetRoom);
    parallelChecks.rateLimit = applyRateLimit(userId, clientIp, targetRoom);
    parallelChecks.bannedIp = realtimeDb.ref(`${targetRoom}/admin/bannedIPs/${sanitizedIp}`).once('value');

    if (sanitizedFingerprint !== 'unknown') {
      parallelChecks.fingerprintTimeout = realtimeDb.ref(`${targetRoom}/admin/fingerprintTimeouts/${sanitizedFingerprint}`).once('value');
      parallelChecks.bannedFingerprint = realtimeDb.ref(`${targetRoom}/admin/bannedFingerprints/${sanitizedFingerprint}`).once('value');
      parallelChecks.fingerprintRate = checkFingerprintRateLimit(sanitizedFingerprint, clientIp, targetRoom);
    }

    if (ipSubnet !== 'unknown') {
      const sanitizedSubnet = sanitizeIpKey(ipSubnet);
      parallelChecks.bannedSubnet = realtimeDb.ref(`${targetRoom}/admin/bannedSubnets/${sanitizedSubnet}`).once('value');
    }

    if (isAnonymous) {
      parallelChecks.anonAllowance = ensureAnonymousAllowance(userId, targetRoom);
    }

    const results = {};
    const keys = Object.keys(parallelChecks);
    const values = await Promise.all(keys.map(k => parallelChecks[k]));
    keys.forEach((k, i) => { results[k] = values[i]; });

    // --- Evaluate results (fast, no I/O) ---

    // Active timeout
    if (results.timeout) {
      const minutesRemaining = Math.max(1, Math.ceil((results.timeout.expiresAt - Date.now()) / 60000));
      return {
        statusCode: 429,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: `Spam protection: please wait ${minutesRemaining} minute(s) before sending new messages.`
        })
      };
    }

    // Banned IP
    if (results.bannedIp && results.bannedIp.exists()) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'You have been banned from sending messages.' })
      };
    }

    // Banned fingerprint
    if (results.bannedFingerprint && results.bannedFingerprint.exists()) {
      await logAdminEvent('Fingerprint Ban Block', `Blocked message from banned fingerprint`, {
        fingerprint: sanitizedFingerprint, userId, clientIp
      }, targetRoom);
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'You have been banned from sending messages.' })
      };
    }

    // Banned subnet
    if (results.bannedSubnet && results.bannedSubnet.exists()) {
      await logAdminEvent('Subnet Ban Block', `Blocked message from banned subnet`, {
        subnet: ipSubnet, userId, clientIp
      }, targetRoom);
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'You have been banned from sending messages.' })
      };
    }

    // Fingerprint timeout
    if (results.fingerprintTimeout) {
      const fingerprintTimeoutData = results.fingerprintTimeout.val();
      if (fingerprintTimeoutData) {
        const now = Date.now();
        const expiresAt = typeof fingerprintTimeoutData.expiresAt === 'number' ? fingerprintTimeoutData.expiresAt : 0;
        if (expiresAt && expiresAt > now) {
          const minutesRemaining = Math.max(1, Math.ceil((expiresAt - now) / 60000));
          return {
            statusCode: 429,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              error: `Spam protection: please wait ${minutesRemaining} minute(s) before sending new messages.`
            })
          };
        } else if (expiresAt && expiresAt <= now) {
          realtimeDb.ref(`${targetRoom}/admin/fingerprintTimeouts/${sanitizedFingerprint}`).remove().catch(() => {});
        }
      }
    }

    // Fingerprint rate limit
    if (results.fingerprintRate && results.fingerprintRate.blocked) {
      const minutesRemaining = results.fingerprintRate.minutesRemaining || 1;
      return {
        statusCode: 429,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: `Rate limit: Maximum ${SPAM_PROTECTION.rateLimitMaxMessages} messages per 15 minutes. Try again in ${minutesRemaining} minute(s).`,
          timeRemaining: results.fingerprintRate.timeRemaining,
          resetTime: results.fingerprintRate.resetTime
        })
      };
    }

    // Anonymous allowance
    if (isAnonymous && results.anonAllowance && !results.anonAllowance.allowed) {
      await logAdminEvent('Anon Limit Block', `Anonymous user ${userId} exceeded free message limit`, {
        userId, clientIp: clientIp || 'unknown'
      }, targetRoom);
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'You reached the anonymous message limit. Register to keep chatting and start earning.',
          code: 'ANON_LIMIT'
        })
      };
    }

    // Burst limit
    if (results.burst && results.burst.blocked) {
      return {
        statusCode: 429,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: `Slow down — too many messages in a short time. Please wait ${results.burst.waitSec} second(s) before sending again.`,
          code: 'BURST_LIMIT',
          waitSec: results.burst.waitSec
        })
      };
    }

    // Rate limit
    if (results.rateLimit && results.rateLimit.timeoutUntil) {
      const minutesRemaining = results.rateLimit.minutesRemaining || Math.max(1, Math.ceil((results.rateLimit.timeoutUntil - Date.now()) / 60000));
      return {
        statusCode: 429,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: `Rate limit: Maximum ${SPAM_PROTECTION.rateLimitMaxMessages} messages per hour. Try again in ${minutesRemaining} minute(s).`,
          timeRemaining: results.rateLimit.timeRemaining,
          resetTime: results.rateLimit.resetTime
        })
      };
    }

    // Duplicate message
    const duplicateCheck = results.duplicate;
    if (!isReaction) {
      if (duplicateCheck.isDuplicate) {
        const timeoutUntil = Date.now() + (5 * 60 * 1000);
        const timeoutRef = realtimeDb.ref(`${targetRoom}/admin/userTimeouts/${userId}`);

        await timeoutRef.set({
          expiresAt: timeoutUntil,
          reason: 'Duplicate message detected - 5 minute timeout',
          createdAt: admin.database.ServerValue.TIMESTAMP,
          clientIp: clientIp || 'unknown'
        });

        await logAdminEvent('Duplicate Message Block', `Blocked duplicate message from ${userId}`, {
          userId, messagePreview: text.trim().slice(0, 100), clientIp: clientIp || 'unknown'
        }, targetRoom);

        return {
          statusCode: 429,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: 'You cannot send the same message twice. Please wait 5 minutes before sending another message.',
            code: 'DUPLICATE_MESSAGE',
            timeRemaining: 5 * 60 * 1000,
            timeoutUntil: new Date(timeoutUntil).toISOString()
          })
        };
      }
    } else {
      if (duplicateCheck.isDuplicate && duplicateCheck.lastMessageTime) {
        const timeSinceLast = Date.now() - duplicateCheck.lastMessageTime;
        if (timeSinceLast < 3000) {
          return {
            statusCode: 429,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              error: 'Please wait before sending the same reaction again.',
              code: 'DUPLICATE_REACTION',
              timeRemaining: 3000 - timeSinceLast
            })
          };
        }
      }
    }

    const messageRef = realtimeDb.ref(`${targetRoom}/messages`).push();
    const serverTimestamp = admin.database.ServerValue.TIMESTAMP;

    await messageRef.set({
      userId,
      userName: userName || (isAnonymous ? 'Anonymous' : 'User'),
      userPhoto: userPhoto || (isAnonymous ? '🎭' : ''),
      isAnonymous: !!isAnonymous,
      isReaction: !!isReaction,
      text: text.trim(),
      timestamp: serverTimestamp,
      ip: clientIp,
      ipKey: sanitizedIp,
      ipSubnet: ipSubnet,
      browserFingerprint: sanitizedFingerprint,
      createdAt: serverTimestamp
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('❌ chat-message error:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
