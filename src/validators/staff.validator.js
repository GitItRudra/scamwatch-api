const Joi = require('joi');
const { ROLE_VALUES, USER_STATUS_VALUES, AUDIT_ACTION_VALUES } = require('../constants');
const { pagination, objectId } = require('./common');

module.exports = {
  review: Joi.object({
    status: Joi.string().valid('verified', 'rejected').required(),
    note: Joi.string().trim().max(500).when('status', { is: 'rejected', then: Joi.required() }),
  }),
  queue: Joi.object(pagination),
  userList: Joi.object({
    ...pagination,
    q: Joi.string().trim().min(2).max(60),
    role: Joi.string().valid(...ROLE_VALUES),
    status: Joi.string().valid(...USER_STATUS_VALUES),
  }),
  setRole: Joi.object({ role: Joi.string().valid(...ROLE_VALUES).required() }),
  setStatus: Joi.object({ status: Joi.string().valid(...USER_STATUS_VALUES).required() }),
  auditList: Joi.object({
    ...pagination,
    action: Joi.string().valid(...AUDIT_ACTION_VALUES),
    actor: objectId,
    entityType: Joi.string().valid('Report', 'User'),
  }),
  overview: Joi.object({
    months: Joi.number().integer().min(1).max(24).default(6),
    top: Joi.number().integer().min(1).max(25).default(10),
  }),
};
