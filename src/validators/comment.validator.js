const Joi = require('joi');
const { objectId, pagination } = require('./common');

module.exports = {
  create: Joi.object({ text: Joi.string().trim().min(1).max(1000).required() }),
  list: Joi.object(pagination),
  commentParams: Joi.object({ id: objectId.required() }),
};
