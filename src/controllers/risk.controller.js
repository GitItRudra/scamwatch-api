const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const riskService = require('../services/riskService');

exports.check = asyncHandler(async (req, res) => {
  ok(res, await riskService.checkIdentifier(req.body));
});

exports.checkBulk = asyncHandler(async (req, res) => {
  ok(res, await riskService.checkMany(req.body.items));
});
