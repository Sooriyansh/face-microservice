const authAttempts = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 12;

function rateLimitAuth(req, res, next) {
  const key = `${req.ip || req.socket.remoteAddress || 'local'}:${req.path}`;
  const now = Date.now();
  const entry = authAttempts.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  entry.count += 1;
  authAttempts.set(key, entry);

  if (entry.count > RATE_LIMIT_MAX_ATTEMPTS) {
    if (req.is('application/json') || req.originalUrl.startsWith('/employee-face-login')) {
      return res.status(429).json({ success: false, message: 'Too many authentication attempts. Please try again shortly.' });
    }
    const view = req.path.includes('signup')
      ? req.body.role === 'admin'
        ? 'auth/admin-register'
        : 'auth/register'
      : req.path.includes('admin')
        ? 'auth/admin-login'
        : 'auth/login';
    return res.status(429).render(view, {
      error: 'Too many authentication attempts. Please try again shortly.',
      nextUrl: req.body.next || req.query.next || '',
    });
  }

  next();
}

module.exports = { rateLimitAuth };
