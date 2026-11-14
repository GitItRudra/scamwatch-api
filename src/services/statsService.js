const Report = require('../models/Report');
const User = require('../models/User');
const { REPORT_STATUS } = require('../constants');

const DAY_MS = 86_400_000;

const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

// Returns every month in the window, including the ones with no reports, so charts have no gaps
function fillMonths(rows, months, now = new Date()) {
  const byKey = new Map(rows.map((r) => [monthKey(r._id.year, r._id.month), r]));
  const result = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = monthKey(date.getUTCFullYear(), date.getUTCMonth() + 1);
    const row = byKey.get(key);
    result.push({ month: key, reports: row?.reports ?? 0, totalLoss: row?.totalLoss ?? 0 });
  }
  return result;
}

async function getOverview({ months, top }) {
  const verified = { status: REPORT_STATUS.VERIFIED };
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

  const groupBy = (field) => [
    { $match: verified },
    { $group: { _id: field, reports: { $sum: 1 }, totalLoss: { $sum: '$amountLost' } } },
    { $sort: { reports: -1 } },
  ];

  const [totals, byScamType, byIdentifierKind, topIdentifiers, trend] = await Promise.all([
    Report.aggregate([
      { $match: verified },
      { $group: { _id: null, reports: { $sum: 1 }, totalLoss: { $sum: '$amountLost' }, averageLoss: { $avg: '$amountLost' } } },
    ]),
    Report.aggregate(groupBy('$scamType')),
    Report.aggregate(groupBy('$identifier.kind')),
    Report.aggregate([
      { $match: verified },
      {
        $group: {
          _id: { kind: '$identifier.kind', normalized: '$identifier.normalized' },
          value: { $last: '$identifier.value' },
          reports: { $sum: 1 },
          totalLoss: { $sum: '$amountLost' },
          lastReportedAt: { $max: '$createdAt' },
        },
      },
      { $sort: { reports: -1, totalLoss: -1 } },
      { $limit: top },
    ]),
    Report.aggregate([
      { $match: { ...verified, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          reports: { $sum: 1 },
          totalLoss: { $sum: '$amountLost' },
        },
      },
    ]),
  ]);

  const summary = totals[0] || { reports: 0, totalLoss: 0, averageLoss: 0 };
  return {
    totals: {
      verifiedReports: summary.reports,
      totalAmountLost: summary.totalLoss,
      averageAmountLost: Math.round(summary.averageLoss || 0),
    },
    byScamType: byScamType.map((r) => ({ scamType: r._id, reports: r.reports, totalLoss: r.totalLoss })),
    byIdentifierKind: byIdentifierKind.map((r) => ({ kind: r._id, reports: r.reports, totalLoss: r.totalLoss })),
    topIdentifiers: topIdentifiers.map((r) => ({
      kind: r._id.kind,
      value: r._id.normalized,
      reports: r.reports,
      totalLoss: r.totalLoss,
      lastReportedAt: r.lastReportedAt,
    })),
    monthlyTrend: fillMonths(trend, months, now),
  };
}

async function getDashboard() {
  const since = new Date(Date.now() - 14 * DAY_MS);

  const [byStatus, usersByRole, suspendedUsers, pending, turnaround, daily] = await Promise.all([
    Report.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    User.countDocuments({ status: 'suspended' }),
    Report.aggregate([
      { $match: { status: REPORT_STATUS.PENDING } },
      { $group: { _id: null, count: { $sum: 1 }, oldest: { $min: '$createdAt' } } },
    ]),
    Report.aggregate([
      { $match: { 'moderation.reviewedAt': { $exists: true } } },
      { $group: { _id: null, avgMs: { $avg: { $subtract: ['$moderation.reviewedAt', '$createdAt'] } } } },
    ]),
    Report.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, reports: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const count = (rows, key) => rows.find((r) => r._id === key)?.count ?? 0;

  return {
    reports: {
      total: byStatus.reduce((sum, r) => sum + r.count, 0),
      pending: count(byStatus, REPORT_STATUS.PENDING),
      verified: count(byStatus, REPORT_STATUS.VERIFIED),
      rejected: count(byStatus, REPORT_STATUS.REJECTED),
    },
    moderation: {
      queueSize: pending[0]?.count ?? 0,
      oldestPendingSince: pending[0]?.oldest ?? null,
      averageReviewHours: turnaround[0] ? Math.round((turnaround[0].avgMs / 3_600_000) * 10) / 10 : null,
    },
    users: {
      total: usersByRole.reduce((sum, r) => sum + r.count, 0),
      moderators: count(usersByRole, 'moderator'),
      admins: count(usersByRole, 'admin'),
      suspended: suspendedUsers,
    },
    reportsPerDay: daily.map((d) => ({ date: d._id, reports: d.reports })),
  };
}

module.exports = { getOverview, getDashboard, fillMonths };
