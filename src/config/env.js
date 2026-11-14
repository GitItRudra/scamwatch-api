const path = require('path');
const dotenv = require('dotenv');
const Joi = require('joi');

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(5000),
  MONGO_URI: Joi.string().pattern(/^mongodb(\+srv)?:\/\//).required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).max(90).default(7),
  BCRYPT_ROUNDS: Joi.number().integer().min(10).max(15).default(12),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  TRUST_PROXY: Joi.number().integer().min(0).default(0),
  UPLOAD_DIR: Joi.string().default('uploads'),
  MAX_UPLOAD_MB: Joi.number().min(1).max(25).default(5),
  ENABLE_DOCS: Joi.boolean().default(true),
  DISABLE_RATE_LIMITS: Joi.boolean().default(false),
}).unknown(true);

const { value: env, error } = schema.validate(process.env, { abortEarly: false });

if (error) {
  const problems = error.details.map((d) => `  - ${d.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${problems}`);
}

if (env.NODE_ENV === 'production' && env.DISABLE_RATE_LIMITS) {
  throw new Error('DISABLE_RATE_LIMITS must not be enabled in production');
}

module.exports = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  mongoUri: env.MONGO_URI,
  trustProxy: env.TRUST_PROXY,
  corsOrigins: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  bcryptRounds: env.BCRYPT_ROUNDS,
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
  },
  refreshToken: {
    ttlMs: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  },
  upload: {
    dir: path.resolve(process.cwd(), env.UPLOAD_DIR),
    maxBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
  },
  enableDocs: env.ENABLE_DOCS,
  disableRateLimits: env.DISABLE_RATE_LIMITS,
});
