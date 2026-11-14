const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');
const { paginate, pageMeta } = require('../utils/pagination');

// An audit failure must never break the action being audited, so it is logged and swallowed.
async function record({ actor, action, entityType, entityId, metadata, ip }) {
  try {
    await AuditLog.create({ actor: actor._id, action, entityType, entityId, metadata, ip });
  } catch (err) {
    logger.error('Failed to write audit log entry', err.message);
  }
}

async function list(query) {
  const filter = {};
  if (query.action) filter.action = query.action;
  if (query.actor) filter.actor = query.actor;
  if (query.entityType) filter.entityType = query.entityType;

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(paginate(query).skip)
      .limit(query.limit)
      .populate('actor', 'name email role')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    items: items.map((e) => ({
      id: e._id,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      actor: e.actor ? { id: e.actor._id, name: e.actor.name, email: e.actor.email, role: e.actor.role } : null,
      metadata: e.metadata,
      ip: e.ip,
      createdAt: e.createdAt,
    })),
    meta: pageMeta(total, query.page, query.limit),
  };
}

module.exports = { record, list };
