const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const context = require('../utils/requestContext');
const moderationService = require('../services/moderationService');
const adminService = require('../services/adminService');
const auditService = require('../services/auditService');
const statsService = require('../services/statsService');

exports.queue = asyncHandler(async (req, res) => {
  const { items, meta } = await moderationService.getQueue(req.query, req.user);
  ok(res, items, meta);
});

exports.review = asyncHandler(async (req, res) => {
  ok(res, await moderationService.reviewReport(req.params.id, req.user, req.body, context(req)));
});

exports.dashboard = asyncHandler(async (req, res) => {
  ok(res, await statsService.getDashboard());
});

exports.listUsers = asyncHandler(async (req, res) => {
  const { items, meta } = await adminService.listUsers(req.query);
  ok(res, items, meta);
});

exports.setRole = asyncHandler(async (req, res) => {
  ok(res, await adminService.setRole(req.params.id, req.user, req.body, context(req)));
});

exports.setStatus = asyncHandler(async (req, res) => {
  ok(res, await adminService.setStatus(req.params.id, req.user, req.body, context(req)));
});

exports.auditLogs = asyncHandler(async (req, res) => {
  const { items, meta } = await auditService.list(req.query);
  ok(res, items, meta);
});
