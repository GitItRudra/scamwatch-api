const Joi = require('joi');
const { SCAM_TYPES, IDENTIFIER_KIND_VALUES, REPORT_STATUS_VALUES } = require('../constants');
const { pagination, objectId } = require('./common');

const kind = Joi.string().valid(...IDENTIFIER_KIND_VALUES);
const scamType = Joi.string().valid(...SCAM_TYPES);

const fields = {
  scamType,
  title: Joi.string().trim().min(8).max(120),
  description: Joi.string().trim().min(30).max(3000),
  identifier: Joi.object({
    kind: kind.required(),
    value: Joi.string().trim().min(3).max(256).required(),
  }),
  amountLost: Joi.number().min(0).max(1_000_000_000).precision(2),
  incidentDate: Joi.date().iso().max('now'),
  isAnonymous: Joi.boolean(),
};

const SORTS = ['newest', 'oldest', 'mostUpvoted', 'highestLoss', 'relevance'];

module.exports = {
  create: Joi.object(fields)
    .fork(['scamType', 'title', 'description', 'identifier'], (s) => s.required())
    .keys({ amountLost: fields.amountLost.default(0), isAnonymous: fields.isAnonymous.default(false) }),

  update: Joi.object(fields).min(1),

  list: Joi.object({
    ...pagination,
    q: Joi.string().trim().min(2).max(100),
    scamType,
    identifierKind: kind,
    identifier: Joi.string().trim().min(3).max(256),
    minAmount: Joi.number().min(0),
    maxAmount: Joi.number().min(0),
    from: Joi.date().iso(),
    to: Joi.date().iso(),
    status: Joi.string().valid(...REPORT_STATUS_VALUES, 'all'),
    sort: Joi.string().valid(...SORTS),
  }).with('identifier', 'identifierKind'),

  mine: Joi.object({
    ...pagination,
    status: Joi.string().valid(...REPORT_STATUS_VALUES),
    scamType,
  }),

  evidenceParams: Joi.object({ id: objectId.required(), evidenceId: objectId.required() }),
};
