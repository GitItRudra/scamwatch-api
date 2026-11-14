const router = require('express').Router();
const controller = require('../controllers/staff.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const schema = require('../validators/staff.validator');
const { idParam } = require('../validators/common');
const { ROLES } = require('../constants');

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/dashboard', controller.dashboard);
router.get('/users', validate({ query: schema.userList }), controller.listUsers);
router.patch('/users/:id/role', validate({ params: idParam, body: schema.setRole }), controller.setRole);
router.patch('/users/:id/status', validate({ params: idParam, body: schema.setStatus }), controller.setStatus);
router.get('/audit-logs', validate({ query: schema.auditList }), controller.auditLogs);

module.exports = router;
