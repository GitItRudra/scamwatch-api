const Comment = require('../models/Comment');
const Report = require('../models/Report');
const AppError = require('../utils/AppError');
const { paginate, pageMeta } = require('../utils/pagination');
const { isStaff } = require('../utils/permissions');
const { REPORT_STATUS } = require('../constants');

// Discussion is limited to verified reports, which are the public ones
async function assertCommentable(reportId) {
  const exists = await Report.exists({ _id: reportId, status: REPORT_STATUS.VERIFIED });
  if (!exists) throw AppError.notFound('Report not found');
}

const present = (comment, author) => ({
  id: comment._id,
  text: comment.text,
  author: author ? { id: author._id, name: author.name } : null,
  createdAt: comment.createdAt,
});

async function addComment(reportId, user, { text }) {
  await assertCommentable(reportId);
  const comment = await Comment.create({ report: reportId, user: user._id, text });
  await Report.updateOne({ _id: reportId }, { $inc: { commentCount: 1 } });
  return present(comment, user);
}

async function listComments(reportId, query) {
  await assertCommentable(reportId);
  const filter = { report: reportId };

  const [docs, total] = await Promise.all([
    Comment.find(filter)
      .sort({ createdAt: -1 })
      .skip(paginate(query).skip)
      .limit(query.limit)
      .populate('user', 'name')
      .lean(),
    Comment.countDocuments(filter),
  ]);

  return {
    items: docs.map((c) => present(c, c.user)),
    meta: pageMeta(total, query.page, query.limit),
  };
}

async function deleteComment(commentId, user) {
  const comment = await Comment.findById(commentId);
  if (!comment) throw AppError.notFound('Comment not found');
  if (String(comment.user) !== String(user._id) && !isStaff(user)) {
    throw AppError.forbidden('You can only delete your own comments');
  }
  await comment.deleteOne();
  await Report.updateOne({ _id: comment.report, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });
}

module.exports = { addComment, listComments, deleteComment };
