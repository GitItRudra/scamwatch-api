const router = require('express').Router();
const controller = require('../controllers/risk.controller');
const validate = require('../middleware/validate');
const limiters = require('../middleware/rateLimiters');
const schema = require('../validators/risk.validator');

// Public on purpose: the point is that anyone can check before they pay
router.post('/check', limiters.risk, validate({ body: schema.check }), controller.check);
router.post('/check/bulk', limiters.risk, validate({ body: schema.bulk }), controller.checkBulk);

module.exports = router;
