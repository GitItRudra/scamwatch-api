const path = require('path');
const Report = require('../models/Report');
const Vote = require('../models/Vote');
const Comment = require('../models/Comment');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const { normalizeIdentifier } = require('../utils/identifier');
const { paginate, pageMeta } = require('../utils/pagination');
const { isStaff, isAdmin, isOwner } = require('../utils/permissions');
const { removeFiles } = require('../utils/fileSignature');
const { presentReport, presentEvidence } = require('./reportPresenter');
const auditService = require('./auditService');
const { REPORT_STATUS, MAX_EVIDENCE_FILES, AUDIT_ACTIONS } = require('../constants');

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  mostUpvoted: { upvoteCount: -1, createdAt: -1 },
  highestLoss: { amountLost: -1, createdAt: -1 },
};

// Verified reports are public record. Anything else is only visible to its author and to staff.
const EDITABLE_STATUSES = [REPORT_STATUS.PENDING, REPORT_STATUS.REJECTED];

const canView = (report, viewer) =>
  report.status === REPORT_STATUS.VERIFIED || isStaff(viewer) || isOwner(report, viewer);

const evidencePath = (filename) => path.join(config.upload.dir, filename);

const sanitizeFileName = (name) => path.basename(String(name)).replace(/[^\w.\- ()]/g, '_').slice(0, 120) || 'file';

// A missing report and a hidden report look identical to the caller
async function loadVisible(id, viewer) {
  const report = await Report.findById(id);
  if (!report || !canView(report, viewer)) throw AppError.notFound('Report not found');
  return report;
}

async function loadOwned(id, user) {
  const report = await Report.findById(id);
  if (!report) throw AppError.notFound('Report not found');
  if (!isOwner(report, user)) {
    throw canView(report, user)
      ? AppError.forbidden('Only the person who filed this report can change it')
      : AppError.notFound('Report not found');
  }
  return report;
}

function assertEditable(report) {
  if (!EDITABLE_STATUSES.includes(report.status)) {
    throw AppError.conflict('Verified reports can no longer be changed', 'REPORT_LOCKED');
  }
}

function buildListFilter(query, viewer) {
  const filter = {};

  const requested = isStaff(viewer) && query.status ? query.status : REPORT_STATUS.VERIFIED;
  if (requested !== 'all') filter.status = requested;

  if (query.scamType) filter.scamType = query.scamType;

  if (query.identifierKind) {
    filter['identifier.kind'] = query.identifierKind;
    if (query.identifier) {
      filter['identifier.normalized'] = normalizeIdentifier(query.identifierKind, query.identifier).normalized;
    }
  }
  if (query.minAmount !== undefined || query.maxAmount !== undefined) {
    filter.amountLost = {};
    if (query.minAmount !== undefined) filter.amountLost.$gte = query.minAmount;
    if (query.maxAmount !== undefined) filter.amountLost.$lte = query.maxAmount;
  }
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = query.from;
    if (query.to) filter.createdAt.$lte = query.to;
  }
  if (query.q) filter.$text = { $search: query.q };

  return filter;
}

async function findPage({ filter, sortKey, query, viewer, relevance = false }) {
  const { skip } = paginate(query);
  const cursor = relevance
    ? Report.find(filter, { score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } })
    : Report.find(filter).sort(SORTS[sortKey]);

  const [docs, total] = await Promise.all([
    cursor.skip(skip).limit(query.limit).populate('reporter', 'name').lean(),
    Report.countDocuments(filter),
  ]);

  return {
    items: docs.map((doc) => presentReport(doc, viewer)),
    meta: pageMeta(total, query.page, query.limit),
  };
}

async function listReports(query, viewer) {
  const filter = buildListFilter(query, viewer);
  const sortKey = query.sort ?? (query.q ? 'relevance' : 'newest');
  const relevance = sortKey === 'relevance' && Boolean(query.q);
  return findPage({ filter, sortKey: relevance ? 'newest' : sortKey, query, viewer, relevance });
}

async function listMine(user, query) {
  const filter = { reporter: user._id };
  if (query.status) filter.status = query.status;
  if (query.scamType) filter.scamType = query.scamType;
  return findPage({ filter, sortKey: 'newest', query, viewer: user });
}

async function getReport(id, viewer) {
  const doc = await Report.findById(id).populate('reporter', 'name').lean();
  if (!doc || !canView(doc, viewer)) throw AppError.notFound('Report not found');

  const result = presentReport(doc, viewer);
  if (viewer) {
    result.viewer = { hasUpvoted: Boolean(await Vote.exists({ report: doc._id, user: viewer._id })) };
  }
  return result;
}

async function createReport(user, payload) {
  const identifier = normalizeIdentifier(payload.identifier.kind, payload.identifier.value);

  const duplicate = await Report.exists({
    reporter: user._id,
    scamType: payload.scamType,
    'identifier.kind': identifier.kind,
    'identifier.normalized': identifier.normalized,
  });
  if (duplicate) {
    throw AppError.conflict(
      'You have already reported this identifier for the same type of scam',
      'DUPLICATE_REPORT'
    );
  }

  const report = await Report.create({ ...payload, identifier, reporter: user._id });

  // Lets the client tell the reporter they are not the first one to see this identifier
  const similarReports = await Report.countDocuments({
    _id: { $ne: report._id },
    'identifier.kind': identifier.kind,
    'identifier.normalized': identifier.normalized,
    status: { $ne: REPORT_STATUS.REJECTED },
  });

  const doc = await Report.findById(report._id).populate('reporter', 'name').lean();
  return { report: presentReport(doc, user), similarReports };
}

async function updateReport(id, user, payload) {
  const report = await loadOwned(id, user);
  assertEditable(report);

  const { identifier, ...rest } = payload;
  report.set(rest);
  if (identifier) report.identifier = normalizeIdentifier(identifier.kind, identifier.value);

  // Editing a rejected report is how a reporter appeals: it goes back into the moderation queue
  if (report.status === REPORT_STATUS.REJECTED) {
    report.status = REPORT_STATUS.PENDING;
    report.set('moderation', undefined);
  }
  await report.save();

  return getReport(report._id, user);
}

async function deleteReport(id, user, context) {
  const admin = isAdmin(user);
  const report = admin ? await Report.findById(id) : await loadOwned(id, user);
  if (!report) throw AppError.notFound('Report not found');
  if (!admin) assertEditable(report);

  await Promise.all([Vote.deleteMany({ report: report._id }), Comment.deleteMany({ report: report._id })]);
  await report.deleteOne();
  await removeFiles(report.evidence.map((e) => evidencePath(e.filename)));

  if (admin) {
    await auditService.record({
      actor: user,
      action: AUDIT_ACTIONS.REPORT_DELETED,
      entityType: 'Report',
      entityId: report._id,
      metadata: { title: report.title, status: report.status, ownReport: isOwner(report, user) },
      ip: context?.ip,
    });
  }
}

async function addEvidence(id, user, files) {
  const uploadedPaths = files.map((f) => f.path);
  try {
    if (!files.length) throw AppError.badRequest('Attach at least one file in the "files" field');

    const report = await loadOwned(id, user);
    assertEditable(report);
    if (report.evidence.length + files.length > MAX_EVIDENCE_FILES) {
      throw AppError.unprocessable(`A report can hold at most ${MAX_EVIDENCE_FILES} evidence files`);
    }

    report.evidence.push(
      ...files.map((f) => ({
        filename: f.filename,
        originalName: sanitizeFileName(f.originalname),
        mimeType: f.mimetype,
        size: f.size,
      }))
    );
    await report.save();
    return report.evidence.map(presentEvidence);
  } catch (err) {
    await removeFiles(uploadedPaths);
    throw err;
  }
}

async function getEvidenceFile(id, evidenceId, user) {
  const report = await loadVisible(id, user);
  if (!isOwner(report, user) && !isStaff(user)) {
    throw AppError.forbidden('Evidence is only available to the reporter and moderators');
  }
  const item = report.evidence.id(evidenceId);
  if (!item) throw AppError.notFound('Evidence file not found');
  return { path: evidencePath(item.filename), originalName: item.originalName };
}

async function removeEvidence(id, evidenceId, user) {
  const report = await loadOwned(id, user);
  assertEditable(report);
  const item = report.evidence.id(evidenceId);
  if (!item) throw AppError.notFound('Evidence file not found');

  const filename = item.filename;
  report.evidence.pull({ _id: evidenceId });
  await report.save();
  await removeFiles([evidencePath(filename)]);
}

async function toggleUpvote(id, user) {
  const report = await Report.findOne({ _id: id, status: REPORT_STATUS.VERIFIED }).select('reporter');
  if (!report) throw AppError.notFound('Report not found');
  if (isOwner(report, user)) throw AppError.forbidden('You cannot upvote your own report');

  const removed = await Vote.findOneAndDelete({ report: id, user: user._id });
  let upvoted = false;
  let delta = -1;

  if (!removed) {
    try {
      await Vote.create({ report: id, user: user._id });
      upvoted = true;
      delta = 1;
    } catch (err) {
      // A concurrent request already created the vote; treat this call as a no-op
      if (err.code !== 11000) throw err;
      delta = 0;
      upvoted = true;
    }
  }

  const updated = await Report.findByIdAndUpdate(id, { $inc: { upvoteCount: delta } }, { new: true });
  return { upvoted, upvoteCount: updated.upvoteCount };
}

module.exports = {
  listReports,
  listMine,
  getReport,
  createReport,
  updateReport,
  deleteReport,
  addEvidence,
  getEvidenceFile,
  removeEvidence,
  toggleUpvote,
};
