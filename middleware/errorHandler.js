const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

function errorHandler(err, req, res, _next) {
  let status = err.statusCode || err.status || 500;
  let message = err.message || 'Server error';

  if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  }
  if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `${field} already in use`;
  }

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error('[API]', req.method, req.originalUrl, err);
  }

  res.status(status).json({ error: message });
}

module.exports = { asyncHandler, errorHandler };
