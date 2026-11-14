const { Types } = require('mongoose');
const Report = require('../../src/models/Report');
const Vote = require('../../src/models/Vote');
const { normalizeIdentifier } = require('../../src/utils/identifier');
const { buildDataset } = require('../../scripts/data/bulkDataset');

const userIds = Array.from({ length: 14 }, () => new Types.ObjectId());
const options = { userIds, moderatorId: new Types.ObjectId(), adminId: new Types.ObjectId(), now: new Date('2026-10-14T00:00:00Z') };
const data = buildDataset(options);

describe('bulk demo dataset', () => {
  it('contains exactly 100 reports with a realistic status mix', () => {
    const count = (s) => data.reports.filter((r) => r.status === s).length;
    expect(data.reports).toHaveLength(100);
    expect(count('verified')).toBeGreaterThan(55);
    expect(count('pending')).toBeGreaterThanOrEqual(8);
    expect(count('rejected')).toBeGreaterThanOrEqual(5);
  });

  it('covers every scam type and identifier kind', () => {
    expect(new Set(data.reports.map((r) => r.scamType)).size).toBe(11);
    expect(new Set(data.reports.map((r) => r.identifier.kind)).size).toBe(5);
  });

  it('passes the real Mongoose schema validation', () => {
    data.reports.forEach((doc) => expect(new Report(doc).validateSync()).toBeUndefined());
    data.votes.forEach((doc) => expect(new Vote(doc).validateSync()).toBeUndefined());
  });

  it('respects the unique index on reporter, identifier and scam type', () => {
    const keys = data.reports.map((r) => [r.reporter, r.identifier.kind, r.identifier.normalized, r.scamType].join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('stores identifiers in the same normalized form the API uses', () => {
    data.reports.forEach((r) => {
      expect(normalizeIdentifier(r.identifier.kind, r.identifier.value).normalized).toBe(r.identifier.normalized);
    });
  });

  it('keeps denormalized counters consistent with the vote and comment records', () => {
    const upvotes = data.reports.reduce((sum, r) => sum + r.upvoteCount, 0);
    const commentCount = data.reports.reduce((sum, r) => sum + r.commentCount, 0);
    expect(data.votes).toHaveLength(upvotes);
    expect(data.comments).toHaveLength(commentCount);
  });

  it('never lets someone vote on their own report or places dates in the future', () => {
    const owner = new Map(data.reports.map((r) => [String(r._id), String(r.reporter)]));
    data.votes.forEach((v) => expect(String(v.user)).not.toBe(owner.get(String(v.report))));
    const all = [...data.reports.map((r) => r.createdAt), ...data.votes.map((v) => v.createdAt), ...data.comments.map((c) => c.createdAt)];
    all.forEach((d) => expect(d.getTime()).toBeLessThanOrEqual(options.now.getTime()));
  });

  it('only verified reports carry votes, and rejected ones carry a moderator note', () => {
    data.reports.filter((r) => r.status !== 'verified').forEach((r) => expect(r.upvoteCount).toBe(0));
    data.reports.filter((r) => r.status === 'rejected').forEach((r) => expect(r.moderation.note).toBeTruthy());
  });

  it('is repeatable for the same seed', () => {
    const again = buildDataset(options);
    expect(again.reports.map((r) => r.title)).toEqual(data.reports.map((r) => r.title));
  });
});
