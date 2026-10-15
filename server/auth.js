const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { pool } = require('./db');

const COOKIE_NAME = 'docmind_sid';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;   // 30 din
const BCRYPT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// User na milne par bhi bcrypt chalate hain, taaki response time se pata na chale ki email exist karta hai ya nahi
const DUMMY_HASH = bcrypt.hashSync('docmind-dummy-password', BCRYPT_ROUNDS);

// ---------- Sessions ----------
// Cookie mein random token jata hai. Database mein sirf uska hash rehta hai,
// toh database leak hone par bhi koi session chura nahi sakta.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function cookieOptions() {
  return {
    httpOnly: true,                                   // JavaScript cookie padh nahi sakta
    sameSite: 'lax',                                  // dusri site se aayi request pe cookie nahi jati
    secure: process.env.NODE_ENV === 'production',    // live site (https) pe hi bhejo
    path: '/'
  };
}

async function createSession(res, userId) {
  await pool.execute('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);   // purane sessions saaf

  const token = crypto.randomBytes(32).toString('hex');
  await pool.execute(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    [hashToken(token), userId, Date.now() + SESSION_MS]
  );

  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: SESSION_MS });
}

// Har request pe chalta hai: cookie se pata karta hai ki kaun login hai (req.user)
async function attachUser(req, res, next) {
  req.user = null;

  try {
    const token = req.cookies && req.cookies[COOKIE_NAME];

    if (typeof token === 'string' && token) {
      const tokenHash = hashToken(token);
      const [rows] = await pool.execute(
        `SELECT u.id, u.email, u.name, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`,
        [tokenHash]
      );
      const row = rows[0];

      if (row && Number(row.expires_at) > Date.now()) {
        req.user = { id: Number(row.id), email: row.email, name: row.name };
      } else if (row) {
        await pool.execute('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
      }
    }
  } catch (error) {
    console.error('Session check failed:', error.message);
  }

  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Please sign in.' });
  }
  next();
}

// ---------- Routes ----------
const router = express.Router();

// Galat password baar-baar try karne se rokta hai (sirf fail hui attempts gini jati hain)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' }
});

function readCredentials(req) {
  const body = req.body || {};
  return {
    email: String(body.email || '').trim().toLowerCase(),
    password: String(body.password || '')
  };
}

router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

router.post('/signup', authLimiter, async (req, res) => {
  try {
    const { email, password } = readCredentials(req);

    if (!EMAIL_RE.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (Buffer.byteLength(password) > 72) {   // bcrypt sirf pehle 72 bytes padhta hai
      return res.status(400).json({ error: 'Password is too long (maximum 72 characters).' });
    }

    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const [result] = await pool.execute('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, hash]);
    const id = Number(result.insertId);

    await createSession(res, id);
    res.status(201).json({ user: { id, email, name: null } });

  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = readCredentials(req);

    const [rows] = await pool.execute(
      'SELECT id, email, name, password_hash FROM users WHERE email = ?',
      [email]
    );
    const user = rows[0];

    const tooLong = password.length > 200;
    const ok = !tooLong && await bcrypt.compare(password, user && user.password_hash ? user.password_hash : DUMMY_HASH);

    // Ek hi message: email galat ho ya password, bahar se pata nahi chalna chahiye
    if (!user || !user.password_hash || !ok) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await createSession(res, Number(user.id));
    res.json({ user: { id: Number(user.id), email: user.email, name: user.name } });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (typeof token === 'string' && token) {
      await pool.execute('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
    }
  } catch (error) {
    console.error(error);
  }
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.json({ ok: true });
});

module.exports = { router, attachUser, requireAuth };