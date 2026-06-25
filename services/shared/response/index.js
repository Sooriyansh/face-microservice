function ok(res, data = {}) {
  return res.json({ success: true, ...data });
}

function created(res, data = {}) {
  return res.status(201).json({ success: true, ...data });
}

function fail(res, status, message, code = 'REQUEST_FAILED', details = {}) {
  return res.status(status).json({
    success: false,
    error: { code, message, details },
  });
}

module.exports = { ok, created, fail };

