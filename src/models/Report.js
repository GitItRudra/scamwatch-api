const mongoose = require('mongoose');
const {
  SCAM_TYPES,
  IDENTIFIER_KIND_VALUES,
  REPORT_STATUS,
  REPORT_STATUS_VALUES,
  MAX_EVIDENCE_FILES,
} = require('../constants');

const { ObjectId } = mongoose.Schema.Types;

const evidenceSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now },
});

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: ObjectId, ref: 'User', required: true },
    isAnonymous: { type: Boolean, default: false },
    scamType: { type: String, enum: SCAM_TYPES, required: true },
    title: { type: String, required: true, trim: true, minlength: 8, maxlength: 120 },
    description: { type: String, required: true, trim: true, minlength: 30, maxlength: 3000 },
    identifier: {
      kind: { type: String, enum: IDENTIFIER_KIND_VALUES, required: true },
      value: { type: String, required: true, trim: true, maxlength: 256 },
      normalized: { type: String, required: true, maxlength: 256 },
    },
    amountLost: { type: Number, default: 0, min: 0, max: 1_000_000_000 },
    incidentDate: Date,
    evidence: {
      type: [evidenceSchema],
      validate: {
        validator: (items) => items.length <= MAX_EVIDENCE_FILES,
        message: `A report can hold at most ${MAX_EVIDENCE_FILES} evidence files`,
      },
    },
    status: { type: String, enum: REPORT_STATUS_VALUES, default: REPORT_STATUS.PENDING },
    moderation: {
      reviewedBy: { type: ObjectId, ref: 'User' },
      reviewedAt: Date,
      note: { type: String, maxlength: 500 },
    },
    upvoteCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Risk lookups and identifier searches
reportSchema.index({ 'identifier.kind': 1, 'identifier.normalized': 1, status: 1 });
// Public feed, moderation queue
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ scamType: 1, status: 1 });
reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ title: 'text', description: 'text' }, { weights: { title: 3, description: 1 } });
// One report per reporter, identifier and scam type; also guards against double submits
reportSchema.index(
  { reporter: 1, 'identifier.kind': 1, 'identifier.normalized': 1, scamType: 1 },
  { unique: true, name: 'unique_reporter_identifier_scamtype' }
);

module.exports = mongoose.model('Report', reportSchema);
