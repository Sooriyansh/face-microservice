require('dotenv').config();

const http = require('http');
const { URL } = require('url');
const logger = require('../../shared/logger');
const { AUTH_COOKIE, parseCookies, verifyJwt } = require('../../../services/auth/auth.service');

const serviceName = process.env.SERVICE_NAME || 'api-gateway';
const port = Number(process.env.PORT || 8080);

const routes = [
  ['/api/auth', process.env.AUTH_SERVICE_URL || 'http://localhost:8081'],
  ['/api/students', process.env.STUDENT_SERVICE_URL || 'http://localhost:8082'],
  ['/api/attendance', process.env.ATTENDANCE_SERVICE_URL || 'http://localhost:8083'],
  ['/api/notifications', process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8084'],
  ['/api/system-events', process.env.SYSTEM_EVENTS_SERVICE_URL || 'http://localhost:8094'],
  ['/api/analytics', process.env.ANALYTICS_SERVICE_URL || 'http://localhost:8088'],
  ['/api/audit', process.env.AUDIT_SERVICE_URL || 'http://localhost:8087'],
  ['/api/recognition', process.env.FACE_RECOGNITION_SERVICE_URL || 'http://localhost:8093'],
  ['/api/training', process.env.TRAINING_SERVICE_URL || 'http://localhost:8092'],
];
const publicPrefixes = ['/api/auth'];
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 120);
const rateLimitBuckets = new Map();

function json(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function targetFor(pathname) {
  return routes.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getClientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function isRateLimited(req) {
  const key = `${getClientIp(req)}:${Math.floor(Date.now() / rateLimitWindowMs)}`;
  const count = (rateLimitBuckets.get(key) || 0) + 1;
  rateLimitBuckets.set(key, count);
  if (rateLimitBuckets.size > 10000) {
    rateLimitBuckets.clear();
  }
  return count > rateLimitMax;
}

function authPayload(req) {
  const auth = String(req.headers.authorization || '');
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
  const cookies = parseCookies(req.headers.cookie || '');
  return verifyJwt(bearer || cookies[AUTH_COOKIE]);
}

function proxy(req, res, targetBase) {
  const target = new URL(req.url, targetBase);
  const payload = authPayload(req);
  const headers = {
    ...req.headers,
    host: target.host,
    'x-forwarded-host': req.headers.host,
    'x-forwarded-proto': 'http',
  };

  if (payload) {
    headers['x-user-id'] = payload.id || '';
    headers['x-user-email'] = payload.email || '';
    headers['x-user-role'] = payload.role || '';
  }

  const upstream = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on('error', (error) => {
    logger.error('Gateway upstream request failed', { error: error.message, target: targetBase });
    json(res, 502, { success: false, message: 'Upstream service unavailable' });
  });

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health/live' || req.url === '/health/ready') {
    return json(res, 200, { status: 'ready', service: serviceName });
  }

  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  const match = targetFor(pathname);
  if (!match) {
    return json(res, 404, { success: false, message: 'Gateway route not found' });
  }

  if (isRateLimited(req)) {
    return json(res, 429, { success: false, message: 'Too many requests' });
  }

  if (!publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) && !authPayload(req)) {
    return json(res, 401, { success: false, message: 'Please login first.' });
  }

  return proxy(req, res, match[1]);
});

server.listen(port, () => {
  logger.info(`${serviceName} listening`, { port });
});
