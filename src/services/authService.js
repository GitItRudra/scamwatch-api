const bcrypt = require('bcryptjs');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const User = require('../models/User');
const tokenService = require('./tokenService');
const { USER_STATUS } = require('../constants');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

// Compared against when the email is unknown, so response time does not reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', config.bcryptRounds);

const invalidCredentials = () => AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

async function issueSession(user, context) {
  return {
    accessToken: tokenService.signAccessToken(user),
    refreshToken: await tokenService.issueRefreshToken(user, context),
    tokenType: 'Bearer',
    expiresIn: config.jwt.accessExpiresIn,
  };
}

async function register({ name, email, password }, context) {
  if (await User.exists({ email })) {
    throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
  }
  const user = await User.create({ name, email, password });
  return { user, session: await issueSession(user, context) };
}

async function recordFailedAttempt(user) {
  if (user.failedLoginAttempts + 1 >= MAX_FAILED_ATTEMPTS) {
    await User.updateOne(
      { _id: user._id },
      { $set: { failedLoginAttempts: 0, lockUntil: new Date(Date.now() + LOCK_DURATION_MS) } }
    );
  } else {
    await User.updateOne({ _id: user._id }, { $inc: { failedLoginAttempts: 1 } });
  }
}

async function login({ email, password }, context) {
  const user = await User.findOne({ email }).select('+password +failedLoginAttempts +lockUntil');

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw invalidCredentials();
  }
  if (user.isLocked()) {
    const minutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
    throw new AppError(`Too many failed attempts. Try again in ${minutes} minute(s)`, 423, 'ACCOUNT_LOCKED');
  }
  if (!(await user.comparePassword(password))) {
    await recordFailedAttempt(user);
    throw invalidCredentials();
  }
  if (user.status !== USER_STATUS.ACTIVE) {
    throw AppError.forbidden('This account has been suspended', 'ACCOUNT_SUSPENDED');
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginAttempts: 0, lastLoginAt: new Date() }, $unset: { lockUntil: 1 } }
  );
  return { user, session: await issueSession(user, context) };
}

async function refresh(rawToken, context) {
  const { user, refreshToken } = await tokenService.rotateRefreshToken(rawToken, context);
  return {
    accessToken: tokenService.signAccessToken(user),
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: config.jwt.accessExpiresIn,
  };
}

async function logout(rawToken) {
  await tokenService.revokeRefreshToken(rawToken);
}

async function changePassword(userId, { currentPassword, newPassword }, context) {
  const user = await User.findById(userId).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    throw AppError.unauthorized('Current password is incorrect', 'INVALID_CREDENTIALS');
  }
  user.password = newPassword;
  await user.save();
  await tokenService.revokeAllForUser(user._id);
  return issueSession(user, context);
}

module.exports = { register, login, refresh, logout, changePassword };
