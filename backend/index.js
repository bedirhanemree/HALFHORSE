require('dotenv').config();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const TwitterStrategy = require('passport-twitter').Strategy; // EKLE
const session = require('express-session');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// const bcrypt = require('bcryptjs'); // KALDIRILDI
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const sharp = require('sharp');
// const nodemailer = require('nodemailer'); // KALDIRILDI
// const crypto = require('crypto'); // KALDIRILDI

// Import models
const User = require('./models/User');
const Drawing = require('./models/Drawing');

// Create Express app
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-very-secret-key-for-jwt';

// --- Static Files Middleware ---
console.log('Setting up static file serving...');
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.png')) {
            res.setHeader('Content-Type', 'image/png');
        } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
            res.setHeader('Content-Type', 'image/jpeg');
        } else if (path.endsWith('.gif')) {
            res.setHeader('Content-Type', 'image/gif');
        } else if (path.endsWith('.webp')) {
            res.setHeader('Content-Type', 'image/webp');
        } else {
            res.setHeader('Content-Type', 'image/png');
        }
    }
}));

// Serve frontend static files
// Check multiple possible paths for frontend
const fs = require('fs');
const possiblePaths = [
    path.join(__dirname, '..', 'frontend'),           // Local dev: backend/../frontend
    path.join(process.cwd(), 'frontend'),             // Railway with root dir empty
    path.join('/app', 'frontend'),                    // Railway absolute
    path.join(__dirname, 'frontend'),                 // If frontend is inside backend
    path.resolve(__dirname, '..', 'frontend')         // Resolved absolute
];

console.log('Setting up static file serving...');
let frontendPath = possiblePaths[0]; // default
for (const p of possiblePaths) {
    console.log(`Checking path: ${p} - exists: ${fs.existsSync(p)}`);
    if (fs.existsSync(p)) {
        frontendPath = p;
        break;
    }
}
console.log('Frontend path:', frontendPath);
app.use(express.static(frontendPath));

// Catch-all route to serve index.html for SPA routing
app.get('/', (req, res) => {
    const indexPath = path.join(frontendPath, 'index.html');
    console.log('Serving index from:', indexPath, 'exists:', fs.existsSync(indexPath));
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send(`Frontend not found. Checked paths: ${possiblePaths.join(', ')}`);
    }
});

// CORS Configuration
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Type']
}));

// Basic Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});
app.use(session({
    secret: JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Nodemailer Transporter Setup - BU BLOK KALDIRILDI
// const transporter = nodemailer.createTransport({...});
// transporter.verify(...)

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:5001/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        console.log('Google OAuth callback triggered for:', profile.emails[0].value);
        let user = await User.findOne({ googleId: profile.id }); // Google ID ile ara

        if (user) {
            console.log('Existing Google user found:', user.username);
            return done(null, user);
        } else {
            // E-posta ile zaten kayıtlı bir kullanıcı varsa, Google ID'sini ekle
            user = await User.findOne({ email: profile.emails[0].value });
            if (user) {
                user.googleId = profile.id;
                await user.save();
                console.log('Existing email user linked with Google:', user.username);
                return done(null, user);
            } else {
                console.log('Creating new user from Google OAuth');
                user = new User({
                    username: profile.displayName || profile.emails[0].value.split('@')[0],
                    email: profile.emails[0].value,
                    googleId: profile.id, // Google ID'yi kaydet
                    avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(profile.displayName || 'User')}`
                });
                await user.save();
                console.log('New user created:', user.username);
                return done(null, user);
            }
        }
    } catch (error) {
        console.error('Google OAuth error:', error);
        return done(error, null);
    }
}));

// Twitter OAuth Strategy
passport.use(new TwitterStrategy({
    consumerKey: process.env.TWITTER_CONSUMER_KEY,
    consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
    callbackURL: "http://localhost:5001/api/auth/twitter/callback",
    includeEmail: true,
    // Bu satırı EKLE:
    userProfileURL: 'https://api.twitter.com/1.1/account/verify_credentials.json?include_email=true&include_entities=false'
}, async (token, tokenSecret, profile, done) => {
    try {
        console.log('Twitter OAuth callback triggered for:', profile.username);
        console.log('--- Full Twitter Profile Object ---', JSON.stringify(profile, null, 2));

        let user = await User.findOne({ twitterId: profile.id }); // Twitter ID ile ara

        if (user) {
            console.log('Existing Twitter user found:', user.username);
            // Kullanıcı zaten varsa, avatarını güncellemek isteyebilirsiniz.
            // Eğer `profile.profile_image_url_https` doğru geliyorsa, burada da güncellemeliyiz.
            if (profile.profile_image_url_https && user.avatar !== profile.profile_image_url_https) {
                user.avatar = profile.profile_image_url_https.replace('_normal', '_400x400');
                await user.save(); // Avatar değiştiyse kaydet
                console.log('Existing user avatar updated:', user.avatar);
            }
            return done(null, user);
        } else {
            // E-posta ile zaten kayıtlı bir kullanıcı varsa, Twitter ID'sini ekle
            const email = profile.emails && profile.emails[0] && profile.emails[0].value ? profile.emails[0].value : null;

            if (email) {
                user = await User.findOne({ email: email });
                if (user) {
                    user.twitterId = profile.id;
                    // Mevcut e-posta ile kayıtlıysa avatarı da güncelle
                    if (profile.profile_image_url_https) {
                        user.avatar = profile.profile_image_url_https.replace('_normal', '_400x400');
                    }
                    await user.save();
                    console.log('Existing email user linked with Twitter:', user.username);
                    return done(null, user);
                }
            }

            console.log('Creating new user from Twitter OAuth');

            // Avatar URL'sini doğrudan profile.profile_image_url_https'ten al
            let twitterAvatarUrl = `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(profile.displayName || profile.username || 'User')}`;
            if (profile.profile_image_url_https) {
                twitterAvatarUrl = profile.profile_image_url_https.replace('_normal', '_400x400'); // _normal varsa değiştir
            }

            user = new User({
                username: profile.displayName || profile.username,
                email: email || `${profile.id}@twitter.com`,
                twitterId: profile.id,
                avatar: twitterAvatarUrl // Yeni belirlenen avatar URL'sini kullan
            });
            await user.save();
            console.log('New user created:', user.username);
            return done(null, user);
        }
    } catch (error) {
        console.error('Twitter OAuth error:', error);
        return done(error, null);
    }
}));

// Passport serialize/deserialize
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// Rate limiting
const drawingLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 50,
    message: { message: 'Too many drawings, please wait a minute.' }
});

// const loginLimit = rateLimit({...}); // BU KALDIRILDI

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Uploads directory created');
}

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/horseGallery')
    .then(() => {
        console.log('MongoDB connected successfully');
        createDatabaseIndexes();
    })
    .catch(err => console.error('MongoDB connection error:', err));

async function createDatabaseIndexes() {
    try {
        await User.collection.createIndex({ email: 1 }, { unique: true });
        await User.collection.createIndex({ username: 1 }, { unique: true });
        await User.collection.createIndex({ googleId: 1 }, { unique: true, sparse: true }); // EKLE
        await User.collection.createIndex({ twitterId: 1 }, { unique: true, sparse: true }); // EKLE
        await Drawing.collection.createIndex({ createdAt: -1 });
        await Drawing.collection.createIndex({ 'likes': 1 });
        console.log('✅ Database indexes created/ensured successfully');
    } catch (error) {
        if (error.codeName === 'IndexOptionsConflict' || error.codeName === 'IndexKeySpecsConflict' || error.message.includes("already exists")) {
            console.log('ℹ️ Index creation skipped (probably already exist with different options or name). Manual review might be needed if issues persist.');
        } else {
            console.error('🚨 Error creating database indexes:', error);
        }
    }
}

// Helper function to construct full URL for static assets (avatars, drawings)
const getFullUrl = (req, filePath) => {
    if (!filePath) {
        return null;
    }
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        return filePath;
    }
    if (filePath.startsWith('assets/')) {
        return filePath; // Frontend asset
    }
    if (filePath.startsWith('/uploads/')) {
        const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
        const host = req.get('host');
        return `${protocol}://${host}${filePath}`;
    }
    return filePath;
};

// Legacy alias for compatibility, or replace usages later
const getFullAvatarUrl = (req, path) => getFullUrl(req, path) || 'assets/default-avatar.png';

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 3 * 1024 * 1024 }, // 3MB limit
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error("Error: File upload only supports the following filetypes - " + filetypes.join(', ')));
    }
});

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(403).json({ message: 'No token provided.' });
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Failed to authenticate token.' });
        }
        req.userId = decoded.id;
        next();
    });
};

const verifyAdmin = async (req, res, next) => {
    verifyToken(req, res, async () => {
        if (!req.userId) {
            return res.status(401).json({ message: 'Authentication required for admin access.' });
        }
        try {
            const user = await User.findById(req.userId);
            if (!user) {
                return res.status(404).json({ message: 'User not found.' });
            }
            if (!user.isAdmin) {
                return res.status(403).json({ message: 'Admin access required.' });
            }
            next();
        } catch (error) {
            res.status(500).json({ message: 'Server error during admin verification.' });
        }
    });
};

// --- AUTHENTICATION ROUTES ---
// app.post('/api/auth/register', ...) // BU KISIM KALDIRILDI
// app.post('/api/auth/login', ...) // BU KISIM KALDIRILDI

app.post('/api/auth/guest', async (req, res) => {
    try {
        const randomId = Math.floor(100000 + Math.random() * 900000); // 6 digit random number
        const username = `Guest_${randomId}`;
        const email = `guest_${randomId}@halfhorse.xyz`; // Dummy email

        // Create new guest user
        const user = new User({
            username: username,
            email: email,
            avatar: `https://api.dicebear.com/8.x/initials/svg?seed=${username}`,
            isGuest: true // Optional: mark as guest if schema supports or just ignore
        });

        await user.save();

        const payload = { id: user.id };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                username: user.username,
                avatar: user.avatar
            }
        });
    } catch (error) {
        console.error('Guest login error:', error);
        res.status(500).json({ message: 'Server error during guest login' });
    }
});

app.get('/api/auth/google', (req, res, next) => {
    // Dynamic Callback determination
    const isProduction = process.env.NODE_ENV === 'production';
    const callbackURL = isProduction
        ? "https://halfhorse.xyz/api/auth/google/callback"
        : "http://localhost:5004/api/auth/google/callback";

    console.log(`Starting Google Auth. Environment: ${process.env.NODE_ENV}, Callback: ${callbackURL}`);

    passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: true,
        callbackURL: callbackURL
    })(req, res, next);
});

app.get('/api/auth/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/login.html?error=oauth_failed',
        session: true
    }),
    async (req, res) => {
        try {
            const payload = { id: req.user.id };
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Login Successful</title>
                    <style>
                        body { font-family: 'Arial', sans-serif; background: #1A1F2E; color: white; text-align: center; padding-top: 50px; margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; overflow: hidden; }
                        .success-container { background: linear-gradient(135deg, #2A2F4A, #1A1F2E); color: #E6E6E6; padding: 40px; border-radius: 20px; display: inline-block; box-shadow: 0 10px 40px rgba(0,0,0,0.5), 0 0 20px rgba(153, 69, 255, 0.3); border: 1px solid rgba(153, 69, 255, 0.5); animation: fadeInScale 0.5s ease-out forwards; max-width: 400px; width: 90%; }
                        .success-icon { font-size: 3em; color: #14F195; margin-bottom: 20px; animation: bounceIn 0.8s ease-out; }
                        h2 { font-size: 2em; color: #14F195; margin-bottom: 10px; }
                        p { font-size: 1.1em; opacity: 0.9; }
                        .spinner { border: 4px solid rgba(153, 69, 255, 0.3); border-top: 4px solid #14F195; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 30px auto; }
                        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                        @keyframes fadeInScale { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
                        @keyframes bounceIn { 0%, 20%, 40%, 60%, 80%, 100% { transition-timing-function: cubic-bezier(0.215, 0.610, 0.355, 1.000); } 0% { opacity: 0; transform: scale3d(0.3, 0.3, 0.3); } 20% { transform: scale3d(1.1, 1.1, 1.1); } 40% { transform: scale3d(0.9, 0.9, 0.9); } 60% { opacity: 1; transform: scale3d(1.03, 1.03, 1.03); } 80% { transform: scale3d(0.97, 0.97, 0.97); } 100% { opacity: 1; transform: scale3d(1, 1, 1); } }
                    </style>
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
                </head>
                <body>
                    <div class="success-container">
                        <div class="success-icon"><i class="fas fa-check-circle"></i></div>
                        <h2>Login Successful</h2>
                        <p>Welcome to HALF-HORSE!</p>
                        <div class="spinner"></div>
                        <p>Redirecting to homepage...</p>
                    </div>
                    <script>
                        const redirectUrl = process.env.NODE_ENV === 'production' 
                            ? '/index.html' 
                            : 'http://localhost:8095/index.html';
                        
                        setTimeout(() => { window.location.href = redirectUrl; }, 2000);
                    </script>
                </body>
                </html>
            `);
        } catch (error) {
            console.error('Google OAuth callback error:', error);
            res.redirect('/login.html?error=oauth_callback_failed');
        }
    }
);

app.get('/api/auth/twitter', passport.authenticate('twitter', { session: true })); // TWITTER ROUTE EKLE
app.get('/api/auth/twitter/callback', // TWITTER CALLBACK EKLE
    passport.authenticate('twitter', {
        failureRedirect: '/login.html?error=oauth_failed',
        session: true
    }),
    async (req, res) => {
        try {
            const payload = { id: req.user.id };
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Login Successful</title>
                    <style>
                        body { font-family: 'Arial', sans-serif; background: #1A1F2E; color: white; text-align: center; padding-top: 50px; margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; overflow: hidden; }
                        .success-container { background: linear-gradient(135deg, #2A2F4A, #1A1F2E); color: #E6E6E6; padding: 40px; border-radius: 20px; display: inline-block; box-shadow: 0 10px 40px rgba(0,0,0,0.5), 0 0 20px rgba(153, 69, 255, 0.3); border: 1px solid rgba(153, 69, 255, 0.5); animation: fadeInScale 0.5s ease-out forwards; max-width: 400px; width: 90%; }
                        .success-icon { font-size: 3em; color: #14F195; margin-bottom: 20px; animation: bounceIn 0.8s ease-out; }
                        h2 { font-size: 2em; color: #14F195; margin-bottom: 10px; }
                        p { font-size: 1.1em; opacity: 0.9; }
                        .spinner { border: 4px solid rgba(153, 69, 255, 0.3); border-top: 4px solid #14F195; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 30px auto; }
                        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                        @keyframes fadeInScale { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
                        @keyframes bounceIn { 0%, 20%, 40%, 60%, 80%, 100% { transition-timing-function: cubic-bezier(0.215, 0.610, 0.355, 1.000); } 0% { opacity: 0; transform: scale3d(0.3, 0.3, 0.3); } 20% { transform: scale3d(1.1, 1.1, 1.1); } 40% { transform: scale3d(0.9, 0.9, 0.9); } 60% { opacity: 1; transform: scale3d(1.03, 1.03, 1.03); } 80% { transform: scale3d(0.97, 0.97, 0.97); } 100% { opacity: 1; transform: scale3d(1, 1, 1); } }
                    </style>
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
                </head>
                <body>
                    <div class="success-container">
                        <div class="success-icon"><i class="fas fa-check-circle"></i></div>
                        <h2>Login Successful</h2>
                        <p>Welcome to HALF-HORSE!</p>
                        <div class="spinner"></div>
                        <p>Redirecting to homepage...</p>
                    </div>
                    <script>
                        localStorage.setItem('authToken', '${token}');
                        setTimeout(() => { window.location.href = 'http://localhost:8089/index.html'; }, 2000);
                    </script>
                </body>
                </html>
            `);
        } catch (error) {
            console.error('Twitter OAuth callback error:', error);
            res.redirect('/login.html?error=oauth_callback_failed');
        }
    }
);


app.get('/api/auth/test', (req, res) => {
    res.json({
        message: 'Auth routes are working',
        google_client_id_exists: !!process.env.GOOGLE_CLIENT_ID,
        google_client_secret_exists: !!process.env.GOOGLE_CLIENT_SECRET,
        timestamp: new Date().toISOString()
    });
});

// --- USER ROUTES ---
app.get('/api/users/me', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId); // .select('-password') KALDIRILDI
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const userObject = user.toObject();
        userObject.avatar = getFullAvatarUrl(req, user.avatar);
        // password alanı User modelinden kalktığı için ayrıca silmeye gerek yok
        res.json(userObject);
    } catch (err) {
        console.error('Get user/me error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
});

app.put('/api/users/me/profile', verifyToken, upload.single('avatar'), async (req, res) => {
    const { bio } = req.body;
    const updateData = {};
    if (bio !== undefined) updateData.bio = bio;
    if (req.file) {
        updateData.avatar = `/uploads/${req.file.filename}`;
    }
    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.userId,
            { $set: updateData },
            { new: true, runValidators: true }
        ); // .select('-password') KALDIRILDI
        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const payload = { id: updatedUser.id };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
        res.json({
            message: 'Profile updated successfully.',
            user: {
                _id: updatedUser.id,
                username: updatedUser.username,
                email: updatedUser.email,
                avatar: getFullAvatarUrl(req, updatedUser.avatar),
                bio: updatedUser.bio,
                hasPublished: updatedUser.hasPublished,
                isAdmin: updatedUser.isAdmin
            },
            token: token
        });
    } catch (err) {
        console.error('Update profile error:', err.message);
        if (err.name === 'MulterError') {
            return res.status(400).json({ message: `File upload error: ${err.message}` });
        }
        if (err.message.startsWith('Error: File upload only supports')) {
            return res.status(400).json({ message: err.message });
        }
        res.status(500).json({ message: 'Server error updating profile.' });
    }
});

// app.put('/api/users/me/password', ...) // BU KISIM KALDIRILDI

// --- ŞİFRE SIFIRLAMA ROTLARI - BU KISIM KALDIRILDI
// app.post('/api/auth/forgot-password', ...)
// app.post('/api/auth/reset-password', ...)
// app.get('/test-email', ...) // BU KISIM KALDIRILDI

// --- DRAWING ROUTES ---
app.get('/api/drawings', async (req, res) => {
    try {
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const skip = (page - 1) * limit;
        const filter = req.query.filter || 'latest';
        const search = req.query.search || '';

        // Build query
        let query = {};
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { tags: { $in: [new RegExp(search, 'i')] } }
            ];
        }

        // Get total count for pagination info
        const totalCount = await Drawing.countDocuments(query);
        const totalPages = Math.ceil(totalCount / limit);

        // Determine sort order
        let sortOrder = { createdAt: -1 }; // default: latest

        // For 'popular' filter, we need aggregation
        let drawings;
        if (filter === 'popular') {
            drawings = await Drawing.aggregate([
                { $match: query },
                { $addFields: { likesCount: { $size: { $ifNull: ['$likes', []] } } } },
                { $sort: { likesCount: -1, createdAt: -1 } },
                { $skip: skip },
                { $limit: limit }
            ]);
            // Populate after aggregation
            drawings = await Drawing.populate(drawings, [
                { path: 'userId', select: 'username avatar' }
            ]);
        } else {
            drawings = await Drawing.find(query)
                .populate('userId', 'username avatar')
                .sort(sortOrder)
                .skip(skip)
                .limit(limit)
                .lean(); // Use lean() for better performance
        }

        const drawingsWithFullAvatarUrls = drawings.map(drawing => {
            const drawingObject = { ...drawing };
            drawingObject.image = getFullUrl(req, drawingObject.image);
            drawingObject.creatorUsername = drawing.userId ? drawing.userId.username : 'Deleted User';
            drawingObject.creatorAvatar = getFullAvatarUrl(req, drawing.userId ? drawing.userId.avatar : null);
            // Don't populate comments in list view - only when viewing single drawing
            drawingObject.comments = drawingObject.comments ? drawingObject.comments.length : 0;
            delete drawingObject.userId;
            return drawingObject;
        });

        res.json({
            drawings: drawingsWithFullAvatarUrls,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalCount: totalCount,
                hasMore: page < totalPages
            }
        });
    } catch (err) {
        console.error('Get all drawings error:', err.message);
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/drawings/:id', async (req, res) => {
    try {
        const drawing = await Drawing.findById(req.params.id)
            .populate('userId', 'username avatar')
            .populate('comments.userId', 'username avatar');

        if (!drawing) {
            return res.status(404).json({ message: 'Drawing not found.' });
        }

        const drawingObject = drawing.toObject();
        drawingObject.image = getFullUrl(req, drawingObject.image); // Transform image URL
        drawingObject.creatorUsername = drawing.userId ? drawing.userId.username : 'Deleted User';
        drawingObject.creatorAvatar = getFullAvatarUrl(req, drawing.userId ? drawing.userId.avatar : null);

        drawingObject.comments = drawingObject.comments.map(comment => {
            const populatedComment = { ...comment };
            populatedComment.username = comment.userId ? comment.userId.username : 'Deleted User';
            populatedComment.userAvatar = getFullAvatarUrl(req, comment.userId ? comment.userId.avatar : null);
            delete populatedComment.userId;
            return populatedComment;
        });
        delete drawingObject.userId;

        res.json(drawingObject);
    } catch (err) {
        console.error('Get drawing detail error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
});

app.post('/api/drawings', drawingLimit, verifyToken, async (req, res) => {
    const { image, title, tags } = req.body;
    if (!image) {
        return res.status(400).json({ message: 'Drawing image is required.' });
    }
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        if (user.hasPublished && !user.isAdmin) {
            return res.status(400).json({ message: 'User has already published a drawing.' });
        }
        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `drawing-${Date.now()}-${req.userId}.webp`;
        const filepath = path.join(__dirname, 'uploads', filename);
        try {
            await sharp(buffer)
                .resize({ width: 800, withoutEnlargement: true })
                .webp({ quality: 80 })
                .toFile(filepath);
        } catch (sharpError) {
            console.error('Sharp image processing error:', sharpError);
            return res.status(500).json({ message: 'Failed to process drawing image.' });
        }
        const drawing = new Drawing({
            image: `/uploads/${filename}`,
            title: title || 'Untitled',
            tags: tags || [],
            userId: user.id // Store only userId
        });
        const savedDrawing = await drawing.save();
        if (!user.isAdmin) {
            user.hasPublished = true;
            await user.save();
        }
        // Populate the saved drawing to return creator info
        const populatedDrawing = await Drawing.findById(savedDrawing._id)
            .populate('userId', 'username avatar')
            .populate('comments.userId', 'username avatar'); // Though no comments yet, for consistency

        const drawingObject = populatedDrawing.toObject();
        drawingObject.image = getFullUrl(req, drawingObject.image); // Transform image URL
        drawingObject.creatorUsername = populatedDrawing.userId ? populatedDrawing.userId.username : 'Deleted User';
        drawingObject.creatorAvatar = getFullAvatarUrl(req, populatedDrawing.userId ? populatedDrawing.userId.avatar : null);
        drawingObject.comments = drawingObject.comments.map(comment => { // Ensure comments array is processed if any
            const populatedComment = { ...comment };
            populatedComment.username = comment.userId ? comment.userId.username : 'Deleted User';
            populatedComment.userAvatar = getFullAvatarUrl(req, comment.userId ? comment.userId.avatar : null);
            delete populatedComment.userId;
            return populatedComment;
        });
        delete drawingObject.userId;
        res.status(201).json(drawingObject);
    } catch (err) {
        console.error('Create drawing error:', err.message);
        res.status(400).json({ message: err.message });
    }
});

app.post('/api/drawings/:id/like', verifyToken, async (req, res) => {
    try {
        const drawing = await Drawing.findById(req.params.id);
        if (!drawing) {
            return res.status(404).json({ message: 'Drawing not found.' });
        }
        const userIdObj = new mongoose.Types.ObjectId(req.userId);
        const likeIndex = drawing.likes.findIndex(id => id.equals(userIdObj));
        if (likeIndex === -1) {
            drawing.likes.push(userIdObj);
        } else {
            drawing.likes.splice(likeIndex, 1);
        }
        await drawing.save();
        const populatedDrawing = await Drawing.findById(drawing._id)
            .populate('userId', 'username avatar')
            .populate('comments.userId', 'username avatar');

        const drawingObject = populatedDrawing.toObject();
        drawingObject.creatorUsername = populatedDrawing.userId ? populatedDrawing.userId.username : 'Deleted User';
        drawingObject.creatorAvatar = getFullAvatarUrl(req, populatedDrawing.userId ? populatedDrawing.userId.avatar : null);
        drawingObject.comments = drawingObject.comments.map(comment => {
            const populatedComment = { ...comment };
            populatedComment.username = comment.userId ? comment.userId.username : 'Deleted User';
            populatedComment.userAvatar = getFullAvatarUrl(req, comment.userId ? comment.userId.avatar : null);
            delete populatedComment.userId;
            return populatedComment;
        });
        delete drawingObject.userId;
        res.json(drawingObject);
    } catch (err) {
        console.error('Like drawing error:', err.message);
        res.status(400).json({ message: err.message });
    }
});

app.post('/api/drawings/:id/comments', verifyToken, async (req, res) => {
    const { text } = req.body;
    if (!text || text.trim() === '') {
        return res.status(400).json({ message: 'Comment text cannot be empty.' });
    }
    try {
        const drawing = await Drawing.findById(req.params.id);
        if (!drawing) {
            return res.status(404).json({ message: 'Drawing not found.' });
        }
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found for commenting.' });
        }
        drawing.comments.push({
            userId: user.id, // Store only userId
            text,
            createdAt: new Date()
        });
        await drawing.save();
        const populatedDrawing = await Drawing.findById(drawing._id)
            .populate('userId', 'username avatar')
            .populate('comments.userId', 'username avatar');

        const drawingObject = populatedDrawing.toObject();
        drawingObject.creatorUsername = populatedDrawing.userId ? populatedDrawing.userId.username : 'Deleted User';
        drawingObject.creatorAvatar = getFullAvatarUrl(req, populatedDrawing.userId ? populatedDrawing.userId.avatar : null);
        drawingObject.comments = drawingObject.comments.map(comment => {
            const populatedComment = { ...comment };
            populatedComment.username = comment.userId ? comment.userId.username : 'Deleted User';
            populatedComment.userAvatar = getFullAvatarUrl(req, comment.userId ? comment.userId.avatar : null);
            delete populatedComment.userId;
            return populatedComment;
        });
        delete drawingObject.userId;
        res.json(drawingObject);
    } catch (err) {
        console.error('Add comment error:', err.message);
        res.status(400).json({ message: err.message });
    }
});

app.get('/api/drawings/:id', async (req, res) => {
    try {
        const drawing = await Drawing.findById(req.params.id)
            .populate('userId', 'username avatar')
            .populate('comments.userId', 'username avatar');
        if (!drawing) {
            return res.status(404).json({ message: 'Drawing not found' });
        }
        const drawingObject = drawing.toObject();
        drawingObject.creatorUsername = drawing.userId ? drawing.userId.username : 'Deleted User';
        drawingObject.creatorAvatar = getFullAvatarUrl(req, drawing.userId ? drawing.userId.avatar : null);
        drawingObject.comments = drawingObject.comments.map(comment => {
            const populatedComment = { ...comment };
            populatedComment.username = comment.userId ? comment.userId.username : 'Deleted User';
            populatedComment.userAvatar = getFullAvatarUrl(req, comment.userId ? comment.userId.avatar : null);
            delete populatedComment.userId;
            return populatedComment;
        });
        delete drawingObject.userId;
        res.json(drawingObject);
    } catch (err) {
        console.error('Get single drawing error:', err.message);
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 20;

        // Use aggregation for efficient sorting by likes count in MongoDB
        const drawings = await Drawing.aggregate([
            { $addFields: { likesCount: { $size: { $ifNull: ['$likes', []] } } } },
            { $sort: { likesCount: -1, createdAt: -1 } },
            { $limit: limit }
        ]);

        // Populate userId after aggregation
        const populatedDrawings = await Drawing.populate(drawings, {
            path: 'userId',
            select: 'username avatar'
        });

        const topDrawings = populatedDrawings.map(d => {
            const dObj = { ...d };
            dObj.image = getFullUrl(req, dObj.image);
            dObj.creatorUsername = d.userId ? d.userId.username : 'Deleted User';
            dObj.creatorAvatar = getFullAvatarUrl(req, d.userId ? d.userId.avatar : null);
            delete dObj.userId;
            return dObj;
        });

        res.json(topDrawings);
    } catch (err) {
        console.error('Get leaderboard error:', err.message);
        res.status(500).json({ message: err.message });
    }
});

// --- STATS ENDPOINT (Public) ---
app.get('/api/stats', async (req, res) => {
    try {
        const totalDrawings = await Drawing.countDocuments();
        const totalUsers = await User.countDocuments();

        // Calculate total likes across all drawings
        const likesResult = await Drawing.aggregate([
            { $project: { likeCount: { $size: { $ifNull: ["$likes", []] } } } },
            { $group: { _id: null, totalLikes: { $sum: "$likeCount" } } }
        ]);
        const totalLikes = likesResult.length > 0 ? likesResult[0].totalLikes : 0;

        // Calculate total comments
        const commentsResult = await Drawing.aggregate([
            { $project: { commentCount: { $size: { $ifNull: ["$comments", []] } } } },
            { $group: { _id: null, totalComments: { $sum: "$commentCount" } } }
        ]);
        const totalComments = commentsResult.length > 0 ? commentsResult[0].totalComments : 0;

        res.json({
            totalDrawings,
            totalUsers,
            totalLikes,
            totalComments,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('Get stats error:', err.message);
        res.status(500).json({ message: err.message });
    }
});

// --- ADMIN ROUTES ---
app.get('/api/admin/users', verifyAdmin, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 }); // .select('-password') KALDIRILDI
        const usersWithFullAvatarUrls = users.map(user => {
            const userObject = user.toObject();
            userObject.avatar = getFullAvatarUrl(req, user.avatar);
            return userObject;
        });
        res.json(usersWithFullAvatarUrls);
    } catch (error) {
        console.error("Admin get users error:", error);
        res.status(500).json({ message: "Server error fetching users." });
    }
});

app.put('/api/admin/users/:userId/toggle-admin', verifyAdmin, async (req, res) => {
    try {
        const userToUpdate = await User.findById(req.params.userId);
        if (!userToUpdate) {
            return res.status(404).json({ message: 'User not found.' });
        }
        if (userToUpdate._id.equals(req.userId) && userToUpdate.isAdmin) {
            const adminCount = await User.countDocuments({ isAdmin: true });
            if (adminCount <= 1) {
                return res.status(400).json({ message: 'Cannot remove admin status from the last admin.' });
            }
        }
        userToUpdate.isAdmin = !userToUpdate.isAdmin;
        await userToUpdate.save();
        const userObject = userToUpdate.toObject();
        // delete userObject.password; // User modelinden password alanı kaldırıldığı için bu satıra gerek kalmayacak
        userObject.avatar = getFullAvatarUrl(req, userToUpdate.avatar);
        res.json({
            message: `User admin status ${userToUpdate.isAdmin ? 'granted' : 'revoked'}.`,
            user: userObject
        });
    } catch (error) {
        console.error("Admin toggle admin error:", error);
        res.status(500).json({ message: "Server error updating user admin status." });
    }
});

app.delete('/api/admin/users/:userId', verifyAdmin, async (req, res) => {
    try {
        const userToDelete = await User.findById(req.params.userId);
        if (!userToDelete) {
            return res.status(404).json({ message: 'User not found.' });
        }
        if (userToDelete.isAdmin) {
            const adminCount = await User.countDocuments({ isAdmin: true });
            if (adminCount <= 1 && userToDelete._id.equals(req.userId)) { // Check if it's the current admin trying to delete themselves
                return res.status(400).json({ message: 'Cannot delete the last admin account.' });
            }
        }
        // Set userId to null in associated drawings.
        // The GET routes will handle displaying 'Deleted User' and default avatar.
        await Drawing.updateMany(
            { userId: userToDelete._id },
            { $set: { userId: null } }
        );
        // Also update comments that might directly reference this user (if any such schema exists, though current one is through Drawing)
        // For comments within Drawings, setting Drawing.userId to null and populating takes care of it.
        // If there were direct comments on users, that would need separate handling.

        await User.findByIdAndDelete(req.params.userId);
        res.json({ message: 'User deleted successfully. Associated drawings will appear as "Deleted User".' });
    } catch (error) {
        console.error("Admin delete user error:", error);
        res.status(500).json({ message: "Server error deleting user." });
    }
});

app.delete('/api/admin/drawings/:drawingId', verifyAdmin, async (req, res) => {
    try {
        const drawing = await Drawing.findById(req.params.drawingId);
        if (!drawing) {
            return res.status(404).json({ message: 'Drawing not found.' });
        }
        if (drawing.userId) { // Check if userId exists (it might be null if user was deleted)
            const creator = await User.findById(drawing.userId);
            if (creator && !creator.isAdmin) { // If creator exists and is not admin
                creator.hasPublished = false;
                await creator.save();
            }
        }
        await Drawing.findByIdAndDelete(req.params.drawingId);
        res.json({ message: 'Drawing deleted successfully and creator publish rights reset (if applicable).' });
    } catch (error) {
        console.error("Admin delete drawing error:", error);
        res.status(500).json({ message: "Server error deleting drawing." });
    }
});

app.delete('/api/admin/reset-gallery', verifyAdmin, async (req, res) => {
    try {
        const deleteResult = await Drawing.deleteMany({});
        const updateResult = await User.updateMany({ isAdmin: false }, { $set: { hasPublished: false } });
        res.json({
            message: 'All drawings deleted and non-admin user publishing rights reset successfully.',
            drawingsDeleted: deleteResult.deletedCount,
            usersReset: updateResult.modifiedCount
        });
    } catch (err) {
        console.error("Admin reset gallery error:", err);
        res.status(500).json({ message: err.message });
    }
});

// --- MIDDLEWARE & ERROR HANDLING ---
app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
        res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
        next();
    }
});

app.use((err, req, res, next) => {
    console.error("--- Global error handler caught an error ---");
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    if (err.message.startsWith('Error: File upload only supports')) {
        return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: 'Something went wrong on the server!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 Google OAuth configured: ${!!process.env.GOOGLE_CLIENT_ID}`);
    console.log(`📊 MongoDB URI configured: ${!!process.env.MONGODB_URI}`);
});