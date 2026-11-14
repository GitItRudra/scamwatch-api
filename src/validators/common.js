const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const idParam = Joi.object({ id: objectId.required() });

const pagination = {
  page: Joi.number().integer().min(1).max(10_000).default(1),
  limit: Joi.number().integer().min(1).max(50).default(10),
};

const paginationQuery = Joi.object(pagination);

module.exports = { objectId, idParam, pagination, paginationQuery };
