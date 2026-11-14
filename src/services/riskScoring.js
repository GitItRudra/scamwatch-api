const { REPORT_STATUS, RISK_LEVELS } = require('../constants');
const { evaluateHeuristics } = require('./riskHeuristics');

const DAY_MS = 86_400_000;

/**
 * The score is the sum of five capped components (maximum 100):
 *   reports    how much recent, verified evidence exists
 *   financial  how much money victims reported losing
 *   community  upvotes on verified reports
 *   momentum   how many reports arrived in the last two weeks
 *   heuristics static red flags in the identifier itself
 * Components with diminishing returns use 1 - e^(-k * x), so the tenth report adds far less than the first.
 */
const CONFIG = Object.freeze({
  maxPoints: { reports: 40, financial: 20, community: 10, momentum: 10, heuristics: 20 },
  halfLifeDays: 120,
  minRecencyWeight: 0.15,
  pendingWeight: 0.35,
  reportSaturation: 0.55,
  upvoteSaturation: 0.15,
  lossCeilingLog10: 6, // INR 10 lakh reaches the full financial score
  momentumWindowDays: 14,
  momentumTarget: 4,
});

const LEVEL_THRESHOLDS = [
  [80, RISK_LEVELS.CRITICAL],
  [60, RISK_LEVELS.HIGH],
  [30, RISK_LEVELS.MEDIUM],
];

const RECOMMENDATIONS = {
  [RISK_LEVELS.CRITICAL]:
    'Do not engage or send money. Block the contact and report it at cybercrime.gov.in or on the 1930 helpline.',
  [RISK_LEVELS.HIGH]:
    'Treat this as a scam. Do not share OTPs, PINs or personal details, and avoid any payment to it.',
  [RISK_LEVELS.MEDIUM]:
    'Be cautious. Verify the sender through an official channel before sharing information or paying.',
  [RISK_LEVELS.LOW]:
    'Little evidence against this identifier. That does not prove it is safe, so verify independently before paying.',
};

const round = (n, places = 1) => Math.round(n * 10 ** places) / 10 ** places;
const saturate = (x, k) => 1 - Math.exp(-k * x);
const part = (score, max) => ({ score: round(score), max });

function recencyWeight(createdAt, now) {
  const ageDays = Math.max(0, (now - new Date(createdAt).getTime()) / DAY_MS);
  return Math.max(CONFIG.minRecencyWeight, 0.5 ** (ageDays / CONFIG.halfLifeDays));
}

function statusWeight(status) {
  if (status === REPORT_STATUS.VERIFIED) return 1;
  if (status === REPORT_STATUS.PENDING) return CONFIG.pendingWeight;
  return 0;
}

function resolveLevel(score) {
  const match = LEVEL_THRESHOLDS.find(([threshold]) => score >= threshold);
  return match ? match[1] : RISK_LEVELS.LOW;
}

function topScamTypes(reports, limit = 3) {
  const counts = new Map();
  reports.forEach((r) => counts.set(r.scamType, (counts.get(r.scamType) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([scamType, count]) => ({ scamType, count }));
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Pure function: given an identifier and the reports filed against it, produce the assessment.
 * Keeping it free of database access makes it easy to unit test and to explain.
 */
function computeRiskAssessment({ identifier, reports, now = new Date() }) {
  const nowMs = new Date(now).getTime();
  const active = reports.filter((r) => r.status !== REPORT_STATUS.REJECTED);
  const verified = active.filter((r) => r.status === REPORT_STATUS.VERIFIED);
  const pending = active.filter((r) => r.status === REPORT_STATUS.PENDING);
  const dismissed = reports.length - active.length;

  let weightedReports = 0;
  let weightedLoss = 0;
  let totalLoss = 0;
  for (const r of active) {
    const weight = statusWeight(r.status);
    weightedReports += weight * recencyWeight(r.createdAt, nowMs);
    weightedLoss += weight * (r.amountLost || 0);
    totalLoss += r.amountLost || 0;
  }

  const upvotes = verified.reduce((sum, r) => sum + (r.upvoteCount || 0), 0);
  const recentCount = active.filter(
    (r) => nowMs - new Date(r.createdAt).getTime() <= CONFIG.momentumWindowDays * DAY_MS
  ).length;
  const heuristics = evaluateHeuristics(identifier.kind, identifier.value);

  const max = CONFIG.maxPoints;
  const raw = {
    reports: max.reports * saturate(weightedReports, CONFIG.reportSaturation),
    financial: max.financial * Math.min(1, Math.log10(1 + weightedLoss) / CONFIG.lossCeilingLog10),
    community: max.community * saturate(upvotes, CONFIG.upvoteSaturation),
    momentum: max.momentum * Math.min(1, recentCount / CONFIG.momentumTarget),
    heuristics: Math.min(heuristics.points, max.heuristics),
  };

  const riskScore = Math.min(100, Math.max(0, Math.round(Object.values(raw).reduce((a, b) => a + b, 0))));
  const riskLevel = resolveLevel(riskScore);

  const signals = [];
  if (verified.length) signals.push(`${plural(verified.length, 'verified report')} on record`);
  if (pending.length) signals.push(`${plural(pending.length, 'report')} awaiting moderator review`);
  if (recentCount) signals.push(`${plural(recentCount, 'report')} filed in the last ${CONFIG.momentumWindowDays} days`);
  if (totalLoss > 0) signals.push(`Victims reported losing INR ${totalLoss.toLocaleString('en-IN')} in total`);
  if (dismissed) signals.push(`${plural(dismissed, 'report')} rejected by moderators and excluded from the score`);
  heuristics.flags.forEach((f) => signals.push(f.message));
  if (!signals.length) signals.push('No reports or suspicious patterns found for this identifier');

  const timestamps = active.map((r) => new Date(r.createdAt).getTime());
  const confidence =
    verified.length >= 3 ? 'high' : active.length > 0 || heuristics.flags.length > 0 ? 'medium' : 'low';

  return {
    identifier: { kind: identifier.kind, value: identifier.value, normalized: identifier.normalized },
    riskScore,
    riskLevel,
    confidence,
    summary: {
      totalReports: active.length,
      verifiedReports: verified.length,
      pendingReports: pending.length,
      rejectedReports: dismissed,
      totalAmountLost: totalLoss,
      firstReportedAt: timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null,
      lastReportedAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
      topScamTypes: topScamTypes(active),
    },
    breakdown: {
      reports: part(raw.reports, max.reports),
      financialImpact: part(raw.financial, max.financial),
      communitySignal: part(raw.community, max.community),
      recentMomentum: part(raw.momentum, max.momentum),
      identifierPatterns: part(raw.heuristics, max.heuristics),
    },
    signals,
    recommendation: RECOMMENDATIONS[riskLevel],
  };
}

module.exports = { computeRiskAssessment, CONFIG, resolveLevel };
