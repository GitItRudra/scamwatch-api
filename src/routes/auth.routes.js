const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/authenticate');
const limiters = require('../middleware/rateLimiters');
const schema = require('../validators/auth.validator');

router.post('/register', limiters.auth, validate({ body: schema.register }), controller.register);
router.post('/login', limiters.auth, validate({ body: schema.login }), controller.login);
router.post('/refresh', limiters.auth, validate({ body: schema.refresh }), controller.refresh);
router.post('/logout', validate({ body: schema.logout }), controller.logout);

router.get('/me', authenticate, controller.me);
router.patch('/me/password', authenticate, limiters.auth, validate({ body: schema.changePassword }), controller.changePassword);

module.exports = router;
