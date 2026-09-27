// handle(fn, status) → an Express handler that responds with JSON of
// `await fn(req)` and forwards any thrown error to the error handler.
function handle(fn, status = 200) {
  return async (req, res, next) => {
    try {
      res.status(status).json(await fn(req, res));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { handle };
