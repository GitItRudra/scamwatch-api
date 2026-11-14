const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/reports', require('./report.routes'));
router.use('/comments', require('./comment.routes'));
router.use('/risk', require('./risk.routes'));
router.use('/stats', require('./stats.routes'));
router.use('/moderation', require('./moderation.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;
