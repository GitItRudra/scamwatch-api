const router = require('express').Router();
const controller = require('../controllers/staff.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const schema = require('../validators/staff.validator');
const { idParam } = require('../validators/common');
const { ROLES } = require('../constants');

router.use(authenticate, authorize(ROLES.MODERATOR, ROLES.ADMIN));

router.get('/queue', validate({ query: schema.queue }), controller.queue);
router.patch('/reports/:id', validate({ params: idParam, body: schema.review }), controller.review);

module.exports = router;
