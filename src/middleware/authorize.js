const AppError = require('../utils/AppError');

module.exports = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(AppError.forbidden());
  }
  return next();
};
