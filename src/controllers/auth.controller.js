const asyncHandler = require('../utils/asyncHandler');
const { ok, created, noContent } = require('../utils/response');
const context = require('../utils/requestContext');
const authService = require('../services/authService');

exports.register = asyncHandler(async (req, res) => {
  const { user, session } = await authService.register(req.body, context(req));
  created(res, { user, ...session });
});

exports.login = asyncHandler(async (req, res) => {
  const { user, session } = await authService.login(req.body, context(req));
  ok(res, { user, ...session });
});

exports.refresh = asyncHandler(async (req, res) => {
  ok(res, await authService.refresh(req.body.refreshToken, context(req)));
});

exports.logout = asyncHandler(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  noContent(res);
});

exports.me = asyncHandler(async (req, res) => {
  ok(res, { user: req.user });
});

exports.changePassword = asyncHandler(async (req, res) => {
  ok(res, await authService.changePassword(req.user._id, req.body, context(req)));
});
