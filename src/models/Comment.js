const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 1000 },
  },
  { timestamps: true }
);

commentSchema.index({ report: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
