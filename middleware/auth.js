const User = require('../models/User');
const { AUTH_COOKIE, clearAuthCookie, parseCookies, verifyJwt } = require('../services/auth/auth.service');

async function attachCurrentUser(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const payload = verifyJwt(cookies[AUTH_COOKIE]);
    req.user = payload ? await User.findById(payload.id).lean() : null;
    res.locals.currentUser = req.user;
    next();
  } catch (error) {
    clearAuthCookie(res);
    next();
  }
}

module.exports = { attachCurrentUser };
