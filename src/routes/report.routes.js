const router = require('express').Router();
const reports = require('../controllers/report.controller');
const comments = require('../controllers/comment.controller');
const validate = require('../middleware/validate');
const { authenticate, optionalAuth } = require('../middleware/authenticate');
const { uploadEvidence } = require('../middleware/upload');
const limiters = require('../middleware/rateLimiters');
const reportSchema = require('../validators/report.validator');
const commentSchema = require('../validators/comment.validator');
const { idParam } = require('../validators/common');

router.get('/', optionalAuth, validate({ query: reportSchema.list }), reports.list);
router.post('/', authenticate, limiters.reportCreate, validate({ body: reportSchema.create }), reports.create);

// Must stay above /:id or "mine" would be read as an id
router.get('/mine', authenticate, validate({ query: reportSchema.mine }), reports.mine);

router.get('/:id', optionalAuth, validate({ params: idParam }), reports.get);
router.patch('/:id', authenticate, validate({ params: idParam, body: reportSchema.update }), reports.update);
router.delete('/:id', authenticate, validate({ params: idParam }), reports.remove);

router.post('/:id/upvote', authenticate, validate({ params: idParam }), reports.upvote);

router.post('/:id/evidence', authenticate, validate({ params: idParam }), uploadEvidence, reports.addEvidence);
router.get('/:id/evidence/:evidenceId', authenticate, validate({ params: reportSchema.evidenceParams }), reports.downloadEvidence);
router.delete('/:id/evidence/:evidenceId', authenticate, validate({ params: reportSchema.evidenceParams }), reports.removeEvidence);

router.get('/:id/comments', validate({ params: idParam, query: commentSchema.list }), comments.list);
router.post('/:id/comments', authenticate, validate({ params: idParam, body: commentSchema.create }), comments.create);

module.exports = router;
