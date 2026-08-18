function errorHandlerMiddleware(err, req, res, next) {
  const sc = err.statusCode || 500;
  const msg = err.message || 'Unexpected error';
  console.error('[AdminPanel] Error', sc + ':', msg);
  return res.status(sc).json({
    success: false, status_code: sc,
    code: err.code || 'INTERNAL_ERROR', message: msg,
  });
}
module.exports = errorHandlerMiddleware;
