function serviceUserContext(req, res, next) {
  req.user = req.user || {
    _id: req.get('x-user-id') || null,
    role: req.get('x-user-role') || 'service',
    email: req.get('x-user-email') || '',
  };
  next();
}

module.exports = { serviceUserContext };

