const config = require('../config/env');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

function toAppError(err) {
  if (err instanceof AppError) return err;

  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return AppError.unprocessable('Validation failed', details);
  }
  if (err.name === 'CastError') {
    return AppError.badRequest(`Invalid value for "${err.path}"`);
  }
  if (err.code === 11000) {
    const fields = Object.keys(err.keyPattern || err.keyValue || {});
    const message = fields.includes('email')
      ? 'An account with this email already exists'
      : 'This record already exists';
    return AppError.conflict(message, 'DUPLICATE');
  }
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new AppError(`File exceeds the ${config.upload.maxBytes / 1024 / 1024} MB limit`, 413, 'FILE_TOO_LARGE');
    }
    return AppError.badRequest(err.message);
  }
  if (err.type === 'entity.parse.failed') return AppError.badRequest('Request body is not valid JSON');
  if (err.type === 'entity.too.large') return new AppError('Request body is too large', 413, 'PAYLOAD_TOO_LARGE');

  return null;
}

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  const known = toAppError(err);

  if (!known) {
    logger.error(`${req.method} ${req.originalUrl}`, err);
  }

  const status = known ? known.statusCode : 500;
  const body = {
    success: false,
    error: {
      code: known ? known.code : 'INTERNAL_ERROR',
      message: known ? known.message : 'Something went wrong on our side',
      ...(known?.details && { details: known.details }),
      ...(!config.isProduction && !known && { stack: err.stack }),
    },
  };
  res.status(status).json(body);
};
