const asyncHandler = require('../utils/asyncHandler');
const { ok, created, noContent } = require('../utils/response');
const context = require('../utils/requestContext');
const reportService = require('../services/reportService');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await reportService.listReports(req.query, req.user);
  ok(res, items, meta);
});

exports.mine = asyncHandler(async (req, res) => {
  const { items, meta } = await reportService.listMine(req.user, req.query);
  ok(res, items, meta);
});

exports.get = asyncHandler(async (req, res) => {
  ok(res, await reportService.getReport(req.params.id, req.user));
});

exports.create = asyncHandler(async (req, res) => {
  created(res, await reportService.createReport(req.user, req.body));
});

exports.update = asyncHandler(async (req, res) => {
  ok(res, await reportService.updateReport(req.params.id, req.user, req.body));
});

exports.remove = asyncHandler(async (req, res) => {
  await reportService.deleteReport(req.params.id, req.user, context(req));
  noContent(res);
});

exports.upvote = asyncHandler(async (req, res) => {
  ok(res, await reportService.toggleUpvote(req.params.id, req.user));
});

exports.addEvidence = asyncHandler(async (req, res) => {
  created(res, await reportService.addEvidence(req.params.id, req.user, req.files || []));
});

exports.downloadEvidence = asyncHandler(async (req, res) => {
  const file = await reportService.getEvidenceFile(req.params.id, req.params.evidenceId, req.user);
  res.set('Cache-Control', 'private, no-store');
  res.download(file.path, file.originalName);
});

exports.removeEvidence = asyncHandler(async (req, res) => {
  await reportService.removeEvidence(req.params.id, req.params.evidenceId, req.user);
  noContent(res);
});
