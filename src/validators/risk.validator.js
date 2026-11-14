const Joi = require('joi');
const { IDENTIFIER_KIND_VALUES } = require('../constants');

const item = Joi.object({
  kind: Joi.string().valid(...IDENTIFIER_KIND_VALUES).required(),
  value: Joi.string().trim().min(3).max(256).required(),
});

module.exports = {
  check: item,
  bulk: Joi.object({ items: Joi.array().items(item).min(1).max(10).required() }),
};
