const User = require('../models/User');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');
const { paginate, pageMeta } = require('../utils/pagination');
const tokenService = require('./tokenService');
const auditService = require('./auditService');
const { USER_STATUS, AUDIT_ACTIONS } = require('../constants');

async function listUsers(query) {
  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(paginate(query).skip).limit(query.limit),
    User.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(total, query.page, query.limit) };
}

async function loadTarget(id, actor) {
  if (String(id) === String(actor._id)) {
    throw AppError.forbidden('You cannot change your own role or status', 'SELF_MODIFICATION');
  }
  const user = await User.findById(id);
  if (!user) throw AppError.notFound('User not found');
  return user;
}

async function setRole(id, actor, { role }, context) {
  const user = await loadTarget(id, actor);
  const previous = user.role;
  user.role = role;
  await user.save();

  await auditService.record({
    actor,
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    entityType: 'User',
    entityId: user._id,
    metadata: { from: previous, to: role },
    ip: context?.ip,
  });
  return user;
}

async function setStatus(id, actor, { status }, context) {
  const user = await loadTarget(id, actor);
  const previous = user.status;
  user.status = status;
  await user.save();

  if (status === USER_STATUS.SUSPENDED) await tokenService.revokeAllForUser(user._id);

  await auditService.record({
    actor,
    action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
    entityType: 'User',
    entityId: user._id,
    metadata: { from: previous, to: status },
    ip: context?.ip,
  });
  return user;
}

module.exports = { listUsers, setRole, setStatus };
