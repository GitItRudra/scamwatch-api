const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const AppError = require('../utils/AppError');

function limiter({ windowMs, limit, message, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => config.isTest || config.disableRateLimits,
    ...(keyGenerator && { keyGenerator }),
    handler: (req, res, next) => next(AppError.tooManyRequests(message)),
  });
}

const MINUTE = 60 * 1000;

module.exports = {
  api: limiter({ windowMs: 15 * MINUTE, limit: 300, message: 'Too many requests, please slow down' }),
  auth: limiter({ windowMs: 15 * MINUTE, limit: 20, message: 'Too many authentication attempts, try again later' }),
  risk: limiter({ windowMs: MINUTE, limit: 30, message: 'Too many risk checks, try again in a minute' }),
  // Always runs after authenticate, so the user id is available
  reportCreate: limiter({
    windowMs: 60 * MINUTE,
    limit: 10,
    message: 'You have submitted too many reports recently, try again later',
    keyGenerator: (req) => req.user.id,
  }),
};
