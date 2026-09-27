function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const badRequest = (message) => httpError(400, message);
const forbidden = (message) => httpError(403, message);
const notFound = (message) => httpError(404, message);
const conflict = (message) => httpError(409, message);

module.exports = { httpError, badRequest, forbidden, notFound, conflict };
