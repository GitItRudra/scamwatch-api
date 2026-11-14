const Joi = require('joi');

const password = Joi.string()
  .min(8)
  .max(72) // bcrypt ignores anything beyond 72 bytes
  .pattern(/[A-Za-z]/, 'letter')
  .pattern(/\d/, 'digit')
  .messages({
    'string.pattern.name': 'Password must contain at least one letter and one digit',
  });

const refreshToken = Joi.string().min(20).max(200).required();

module.exports = {
  register: Joi.object({
    name: Joi.string().trim().min(2).max(60).required(),
    email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(254).required(),
    password: password.required(),
  }),
  login: Joi.object({
    email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required(),
    password: Joi.string().max(72).required(),
  }),
  refresh: Joi.object({ refreshToken }),
  logout: Joi.object({ refreshToken }),
  changePassword: Joi.object({
    currentPassword: Joi.string().max(72).required(),
    newPassword: password.required(),
  }),
};
