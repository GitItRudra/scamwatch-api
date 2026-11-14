const asyncHandler = require('../utils/asyncHandler');
const { ok, created, noContent } = require('../utils/response');
const commentService = require('../services/commentService');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await commentService.listComments(req.params.id, req.query);
  ok(res, items, meta);
});

exports.create = asyncHandler(async (req, res) => {
  created(res, await commentService.addComment(req.params.id, req.user, req.body));
});

exports.remove = asyncHandler(async (req, res) => {
  await commentService.deleteComment(req.params.id, req.user);
  noContent(res);
});
