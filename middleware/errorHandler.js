function notFoundApi(req, res) {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.originalUrl}`,
  });
}

function errorHandler(error, req, res, next) {
  console.error(error);

  if (req.originalUrl.startsWith('/api/')) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }

  res.status(500).render('shared/error', {
    message: error.message || 'Internal server error',
  });
}

module.exports = { errorHandler, notFoundApi };
