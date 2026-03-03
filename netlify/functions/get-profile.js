// Profile API with Firebase integration - v4
const admin = require('firebase-admin');

// Initialize Firebase Admin with error handling
let db;
try {
    if (!admin.apps.length) {
        console.log('Initializing Firebase Admin...');
        console.log('Environment check:', {
            hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
            hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
            hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL
        });
        
        if (process.env.FIREBASE_PRIVATE_KEY) {
            // Use environment variables (production)
            console.log('Using environment variables for Firebase');
            
            // Format the private key properly
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
            // Use application default (local development)
            console.log('Using application default for Firebase');
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
                projectId: "dogemoon-324f0"
            });
        }
    }
    db = admin.firestore();
    console.log('Firebase initialized successfully');
} catch (initError) {
    console.error('Firebase initialization failed:', initError);
    throw initError;
}

exports.handler = async (event, context) => {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // Check if Firebase is initialized
    if (!db) {
        console.error('Firebase not initialized');
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Database not initialized',
                details: 'Firebase connection failed'
            })
        };
    }

    try {
        const { id } = event.queryStringParameters || {};
        
        if (!id) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Profile ID is required' })
            };
        }

        // Try Firebase first
        try {
            const profileDoc = await db.collection('thot_profiles').doc(id).get();
            
            if (profileDoc.exists) {
                const profile = profileDoc.data();
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        profile: {
                            id: id,
                            name: profile.name,
                            occupation: profile.occupation,
                            location: profile.location,
                            photoUrl: profile.photoUrl,
                            bio: profile.bio,
                            skills: profile.skills,
                            marketScore: profile.marketScore,
                            growthScore: profile.growthScore,
                            impactScore: profile.impactScore,
                            whyScore: profile.marketScore
                        }
                    })
                };
            }
        } catch (firebaseError) {
            console.error('Firebase error:', firebaseError.message);
            console.error('Firebase error code:', firebaseError.code);
            console.error('Firebase error stack:', firebaseError.stack);
            console.error('Environment vars present:', {
                hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
                hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
                hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL
            });
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Failed to fetch profile from database',
                    details: firebaseError.message,
                    code: firebaseError.code
                })
            };
        }

        // Profile not found in Firebase
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Profile not found' })
        };
        
    } catch (error) {
        console.error('Error fetching profile:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Internal server error', 
                details: error.message
            })
        };
    }
};