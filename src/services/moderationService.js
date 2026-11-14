const Report = require('../models/Report');
const AppError = require('../utils/AppError');
const { paginate, pageMeta } = require('../utils/pagination');
const { isOwner } = require('../utils/permissions');
const { presentReport } = require('./reportPresenter');
const auditService = require('./auditService');
const { REPORT_STATUS, AUDIT_ACTIONS } = require('../constants');

// Oldest first, so nothing sits in the queue forever
async function getQueue(query, moderator) {
  const filter = { status: REPORT_STATUS.PENDING };
  const [docs, total] = await Promise.all([
    Report.find(filter)
      .sort({ createdAt: 1 })
      .skip(paginate(query).skip)
      .limit(query.limit)
      .populate('reporter', 'name')
      .lean(),
    Report.countDocuments(filter),
  ]);
  return {
    items: docs.map((d) => presentReport(d, moderator)),
    meta: pageMeta(total, query.page, query.limit),
  };
}

async function reviewReport(id, moderator, { status, note }, context) {
  // The status condition makes the transition atomic, so two moderators cannot both decide the same report
  const updated = await Report.findOneAndUpdate(
    { _id: id, status: REPORT_STATUS.PENDING, reporter: { $ne: moderator._id } },
    { $set: { status, moderation: { reviewedBy: moderator._id, reviewedAt: new Date(), note } } },
    { new: true }
  )
    .populate('reporter', 'name')
    .lean();

  if (!updated) {
    const existing = await Report.findById(id).select('status reporter');
    if (!existing) throw AppError.notFound('Report not found');
    if (isOwner(existing, moderator)) throw AppError.forbidden('You cannot review your own report');
    throw AppError.conflict('Only pending reports can be reviewed', 'ALREADY_REVIEWED');
  }

  await auditService.record({
    actor: moderator,
    action: AUDIT_ACTIONS.REPORT_REVIEWED,
    entityType: 'Report',
    entityId: updated._id,
    metadata: { decision: status, note: note ?? null },
    ip: context?.ip,
  });

  return presentReport(updated, moderator);
}

module.exports = { getQueue, reviewReport };
