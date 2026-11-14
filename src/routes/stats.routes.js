const router = require('express').Router();
const controller = require('../controllers/stats.controller');
const validate = require('../middleware/validate');
const schema = require('../validators/staff.validator');

router.get('/overview', validate({ query: schema.overview }), controller.overview);

module.exports = router;
