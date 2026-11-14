const Report = require('../models/Report');
const AppError = require('../utils/AppError');
const { normalizeIdentifier } = require('../utils/identifier');
const { computeRiskAssessment } = require('./riskScoring');

// Upper bound on how many reports feed one assessment
const MAX_REPORTS_CONSIDERED = 1000;

async function checkIdentifier({ kind, value }) {
  const identifier = normalizeIdentifier(kind, value);

  const reports = await Report.find({
    'identifier.kind': identifier.kind,
    'identifier.normalized': identifier.normalized,
  })
    .select('status scamType amountLost upvoteCount createdAt')
    .sort({ createdAt: -1 })
    .limit(MAX_REPORTS_CONSIDERED)
    .lean();

  return computeRiskAssessment({ identifier, reports });
}

// One bad entry should not fail the whole batch
async function checkMany(items) {
  return Promise.all(
    items.map(async (item) => {
      try {
        return { input: item, result: await checkIdentifier(item) };
      } catch (err) {
        if (err instanceof AppError) return { input: item, error: err.message };
        throw err;
      }
    })
  );
}

module.exports = { checkIdentifier, checkMany };
