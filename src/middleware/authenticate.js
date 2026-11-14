const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const User = require('../models/User');
const tokenService = require('../services/tokenService');
const { USER_STATUS } = require('../constants');

function bearerToken(req) {
  const header = req.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

async function resolveUser(token) {
  const payload = tokenService.verifyAccessToken(token);
  const user = await User.findById(payload.sub);
  if (!user) throw AppError.unauthorized('The account for this token no longer exists');
  if (user.status !== USER_STATUS.ACTIVE) {
    throw AppError.forbidden('This account has been suspended', 'ACCOUNT_SUSPENDED');
  }
  if (user.changedPasswordAfter(payload.iat)) {
    throw AppError.unauthorized('Password was changed, please log in again', 'TOKEN_REVOKED');
  }
  return user;
}

const authenticate = asyncHandler(async (req, res, next) => {
  const token = bearerToken(req);
  if (!token) throw AppError.unauthorized();
  req.user = await resolveUser(token);
  next();
});

// For public routes that behave differently for logged-in users
const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = bearerToken(req);
  if (token) req.user = await resolveUser(token);
  next();
});

module.exports = { authenticate, optionalAuth };
