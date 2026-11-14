const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const statsService = require('../services/statsService');

exports.overview = asyncHandler(async (req, res) => {
  ok(res, await statsService.getOverview(req.query));
});
