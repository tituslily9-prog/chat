// Netlify Function: Register user for why bot gamification
// Call this when a user registers to enable why bot features

const admin = require('firebase-admin');

// Initialize Firebase Admin
let db;
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
        })
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: "dogemoon-324f0"
      });
    }
  }
  db = admin.firestore();
} catch (error) {
  console.error('Firebase init error:', error);
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
    const requestData = JSON.parse(event.body);
    const { userId, walletAddress } = requestData;

    if (!userId || typeof userId !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'User ID is required' })
      };
    }

    if (!db) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database not initialized' })
      };
    }

    // Register user in why_users collection
    await db.collection('why_users').doc(userId).set({
      userId: userId,
      walletAddress: walletAddress || null,
      whyTokens: 0,
      totalEarned: 0,
      registeredAt: admin.firestore.FieldValue.serverTimestamp(),
      lastQuestionTime: null
    }, { merge: true });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'User registered for why bot gamification',
        userId: userId
      })
    };

  } catch (error) {
    console.error('Registration error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

