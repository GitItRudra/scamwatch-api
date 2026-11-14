const router = require('express').Router();
const controller = require('../controllers/comment.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/authenticate');
const { idParam } = require('../validators/common');

router.delete('/:id', authenticate, validate({ params: idParam }), controller.remove);

module.exports = router;
