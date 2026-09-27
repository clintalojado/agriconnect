function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(err);
    // Don't leak internals (SQL errors, stack details) to the browser.
    return res.status(status).json({ message: err.status ? err.message : "Internal server error" });
  }
  res.status(status).json({ message: err.message || "Bad request" });
}

module.exports = { errorHandler };
