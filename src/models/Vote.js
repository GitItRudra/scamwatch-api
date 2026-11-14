const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema(
  {
    report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

voteSchema.index({ report: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Vote', voteSchema);
