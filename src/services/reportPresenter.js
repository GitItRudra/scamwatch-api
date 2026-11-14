const { isStaff, isOwner, reporterIdOf } = require('../utils/permissions');

function presentEvidence(item) {
  return {
    id: item._id,
    originalName: item.originalName,
    mimeType: item.mimeType,
    size: item.size,
    uploadedAt: item.uploadedAt,
  };
}

/**
 * Shapes a report for a specific viewer. Expects a lean (or toObject) document with `reporter` populated.
 * Anonymous reporters are hidden from the public, and evidence files are visible only to the
 * owner and to staff, since screenshots often contain personal details of the victim.
 */
function presentReport(doc, viewer) {
  const owner = isOwner(doc, viewer);
  const privileged = owner || isStaff(viewer);
  const populated = doc.reporter && doc.reporter._id ? doc.reporter : null;
  const evidence = doc.evidence || [];

  const result = {
    id: doc._id,
    scamType: doc.scamType,
    title: doc.title,
    description: doc.description,
    identifier: { kind: doc.identifier.kind, value: doc.identifier.value },
    amountLost: doc.amountLost,
    incidentDate: doc.incidentDate ?? null,
    status: doc.status,
    isAnonymous: doc.isAnonymous,
    upvoteCount: doc.upvoteCount,
    commentCount: doc.commentCount,
    evidenceCount: evidence.length,
    reporter:
      populated && (!doc.isAnonymous || privileged) ? { id: populated._id, name: populated.name } : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };

  if (privileged) {
    result.evidence = evidence.map(presentEvidence);
    result.moderation = doc.moderation && doc.moderation.reviewedAt
      ? {
          reviewedBy: doc.moderation.reviewedBy,
          reviewedAt: doc.moderation.reviewedAt,
          note: doc.moderation.note ?? null,
        }
      : null;
  }
  if (privileged && !populated) {
    result.reporter = { id: reporterIdOf(doc), name: null };
  }
  return result;
}

module.exports = { presentReport, presentEvidence };
