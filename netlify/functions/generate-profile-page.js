const fs = require('fs');
const path = require('path');

exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { profileId, profileData, evaluationData } = JSON.parse(event.body);
        
        if (!profileId || !profileData || !evaluationData) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing required data' })
            };
        }

        // Generate profile slug
        const profileSlug = profileData.name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();

        // Generate profile page HTML
        const profileHTML = generateProfileHTML(profileData, evaluationData, profileSlug);
        
        // Save to profiles directory
        const profilesDir = path.join(__dirname, '../../profiles');
        if (!fs.existsSync(profilesDir)) {
            fs.mkdirSync(profilesDir, { recursive: true });
        }
        
        const filePath = path.join(profilesDir, `${profileSlug}.html`);
        fs.writeFileSync(filePath, profileHTML);
        
        // Update _redirects file
        await updateRedirects(profileSlug);
        
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true, 
                profileUrl: `https://popn.ai/${profileSlug}`,
                filePath: filePath
            })
        };

    } catch (error) {
        console.error('Error generating profile page:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

function generateProfileHTML(profile, evaluation, slug) {
    const profileUrl = `https://popn.ai/${slug}`;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${profile.name} - POPN</title>
    
    <!-- Favicon -->
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'><stop offset='0%25' style='stop-color:%2300D4FF;stop-opacity:1' /><stop offset='100%25' style='stop-color:%2300FFB3;stop-opacity:1' /></linearGradient></defs><polygon points='50,15 61,40 88,40 67,57 75,82 50,65 25,82 33,57 12,40 39,40' fill='url(%23grad)'/><animateTransform attributeName='transform' type='rotate' from='0 50 50' to='360 50 50' dur='3s' repeatCount='indefinite'/><animate attributeName='opacity' values='1;0.5;1' dur='1.5s' repeatCount='indefinite'/></svg>">
    
    <!-- Open Graph Meta Tags -->
    <meta property="og:title" content="${profile.name} scored ${evaluation.impactScore} on POPN">
    <meta property="og:description" content="${evaluation.summary}">
    <meta property="og:image" content="${profile.photoUrl}">
    <meta property="og:url" content="${profileUrl}">
    <meta property="og:type" content="profile">
    
    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${profile.name} scored ${evaluation.impactScore} on POPN">
    <meta name="twitter:description" content="${evaluation.summary}">
    <meta name="twitter:image" content="${profile.photoUrl}">
    
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --bg-primary: #0a0a0a; --bg-secondary: #1a1a1a; --text-primary: #ffffff;
            --text-secondary: #a0a0a0; --accent-blue: #00D4FF; --accent-green: #00FFB3;
            --border: #333333; --gradient: linear-gradient(135deg, var(--accent-blue), var(--accent-green));
        }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg-primary); color: var(--text-primary); line-height: 1.6; min-height: 100vh; }
        .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
        .header { text-align: center; margin-bottom: 40px; }
        .logo { font-size: 2.5rem; font-weight: 700; background: var(--gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 10px; }
        .tagline { color: var(--text-secondary); font-size: 1.1rem; }
        .profile-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 20px; padding: 40px; text-align: center; margin-bottom: 40px; }
        .profile-photo { width: 200px; height: 200px; border-radius: 50%; object-fit: cover; margin: 0 auto 30px; border: 3px solid var(--accent-blue); }
        .profile-name { font-size: 2.5rem; font-weight: 700; margin-bottom: 20px; background: var(--gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .score-section { margin: 30px 0; }
        .score-label { font-size: 1.2rem; color: var(--text-secondary); margin-bottom: 10px; }
        .score-value { font-size: 4rem; font-weight: 700; background: var(--gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; animation: scoreReveal 2s ease-out; }
        @keyframes scoreReveal { 0% { opacity: 0; transform: scale(0.5); } 100% { opacity: 1; transform: scale(1); } }
        .the-deal { background: rgba(0, 212, 255, 0.1); border: 1px solid var(--accent-blue); border-radius: 16px; padding: 30px; margin: 30px 0; }
        .the-deal h3 { font-size: 1.8rem; margin-bottom: 20px; color: var(--accent-blue); }
        .the-deal p { font-size: 1.1rem; line-height: 1.8; color: var(--text-primary); }
        .cta-section { text-align: center; margin-top: 40px; }
        .cta-button { display: inline-block; background: var(--gradient); color: var(--bg-primary); padding: 15px 30px; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 1.1rem; transition: transform 0.2s; }
        .cta-button:hover { transform: translateY(-2px); }
        .share-section { margin-top: 30px; text-align: center; }
        .share-text { color: var(--text-secondary); margin-bottom: 20px; }
        .share-buttons { display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; }
        .share-button { padding: 10px 20px; border: 1px solid var(--border); border-radius: 25px; background: var(--bg-secondary); color: var(--text-primary); text-decoration: none; transition: all 0.2s; }
        .share-button:hover { border-color: var(--accent-blue); color: var(--accent-blue); }
        @media (max-width: 768px) {
            .container { padding: 20px 15px; }
            .profile-card { padding: 30px 20px; }
            .profile-photo { width: 150px; height: 150px; }
            .profile-name { font-size: 2rem; }
            .score-value { font-size: 3rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1 class="logo">POPN</h1>
            <p class="tagline">The Human NASDAQ</p>
        </header>
        
        <div class="profile-card">
            <img src="${profile.photoUrl || 'https://placehold.co/400x400/111/fff?text=Photo'}" alt="${profile.name}" class="profile-photo">
            <h2 class="profile-name">${profile.name}</h2>
            
            <div class="score-section">
                <div class="score-label">SCORE</div>
                <div class="score-value">${evaluation.impactScore || 0}</div>
            </div>
            
            <div class="the-deal">
                <h3>THE DEAL</h3>
                <p>${evaluation.summary || 'No evaluation available'}</p>
            </div>
        </div>
        
        <div class="cta-section">
            <a href="https://popn.ai" class="cta-button">Get Your Own SCORE</a>
        </div>
        
        <div class="share-section">
            <p class="share-text">Share ${profile.name}'s profile:</p>
            <div class="share-buttons">
                <a href="https://twitter.com/intent/tweet?text=Check%20out%20${encodeURIComponent(profile.name)}'s%20POPN%20profile%20-%20they%20scored%20${evaluation.impactScore || 0}!&url=${encodeURIComponent(profileUrl)}" class="share-button" target="_blank">Twitter</a>
                <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(profileUrl)}" class="share-button" target="_blank">LinkedIn</a>
                <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileUrl)}" class="share-button" target="_blank">Facebook</a>
            </div>
        </div>
    </div>
</body>
</html>`;
}

async function updateRedirects(profileSlug) {
    const redirectsPath = path.join(__dirname, '../../_redirects');
    let redirects = '';
    
    // Read existing redirects
    if (fs.existsSync(redirectsPath)) {
        redirects = fs.readFileSync(redirectsPath, 'utf8');
    }
    
    // Add new redirect if not exists
    const newRedirect = `/${profileSlug} /profiles/${profileSlug}.html 200`;
    if (!redirects.includes(newRedirect)) {
        // Remove fallback line temporarily
        redirects = redirects.replace(/\n\/\* \/index\.html 404\n/, '');
        
        // Add new redirect
        redirects += `\n${newRedirect}`;
        
        // Add fallback back
        redirects += '\n/* /index.html 404\n';
        
        // Write back
        fs.writeFileSync(redirectsPath, redirects);
    }
}
