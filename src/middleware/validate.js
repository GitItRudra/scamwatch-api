const AppError = require('../utils/AppError');

const PARTS = ['params', 'query', 'body'];

/**
 * validate({ body: schema, query: schema, params: schema })
 * Unknown keys are stripped, which also blocks mass assignment (e.g. a client sending "role").
 */
module.exports = (schemas) => (req, res, next) => {
  const details = [];

  for (const part of PARTS) {
    if (!schemas[part]) continue;
    const { value, error } = schemas[part].validate(req[part], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      error.details.forEach((d) =>
        details.push({ field: [part === 'body' ? null : part, ...d.path].filter(Boolean).join('.'), message: d.message.replace(/"/g, "'") })
      );
    } else {
      req[part] = value;
    }
  }

  if (details.length) return next(AppError.unprocessable('Validation failed', details));
  return next();
};
