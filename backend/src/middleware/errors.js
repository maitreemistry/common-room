export function apiError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function notFoundHandler(_request, response) {
  response.status(404).json({
    success: false,
    data: null,
    error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' }
  });
}

export function errorHandler(error, _request, response, _next) {
  const status = error.type === 'entity.parse.failed'
    ? 400
    : error.type === 'entity.too.large'
      ? 413
      : Number.isInteger(error.status) ? error.status : 500;
  const code = error.type === 'entity.parse.failed'
    ? 'INVALID_JSON'
    : error.type === 'entity.too.large'
      ? 'PAYLOAD_TOO_LARGE'
      : error.code ?? 'INTERNAL_ERROR';
  const message = status === 400 && code === 'INVALID_JSON'
    ? 'Request body must contain valid JSON.'
    : status === 413
      ? 'Request body is too large.'
      : status < 500 ? error.message : 'An internal error occurred.';
  response.status(status).json({ success: false, data: null, error: { code, message } });
}