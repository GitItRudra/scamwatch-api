const { computeRiskAssessment, resolveLevel } = require('../../src/services/riskScoring');

const NOW = new Date('2026-06-01T00:00:00Z');
const daysAgo = (days) => new Date(NOW.getTime() - days * 86_400_000);

const identifier = { kind: 'phone', value: '9876501234', normalized: '9876501234' };
const report = (overrides = {}) => ({
  status: 'verified',
  scamType: 'upi_fraud',
  amountLost: 0,
  upvoteCount: 0,
  createdAt: daysAgo(1),
  ...overrides,
});
const assess = (reports, id = identifier) => computeRiskAssessment({ identifier: id, reports, now: NOW });

describe('computeRiskAssessment', () => {
  it('rates an unknown, clean identifier as low risk with low confidence', () => {
    const result = assess([]);
    expect(result.riskScore).toBe(0);
    expect(result.riskLevel).toBe('low');
    expect(result.confidence).toBe('low');
    expect(result.summary.totalReports).toBe(0);
    expect(result.signals).toHaveLength(1);
  });

  it('scores a heavily reported identifier as high or critical', () => {
    const reports = Array.from({ length: 6 }, (_, i) =>
      report({ amountLost: 25_000, upvoteCount: 4, createdAt: daysAgo(i * 2) })
    );
    const result = assess(reports);
    expect(['high', 'critical']).toContain(result.riskLevel);
    expect(result.confidence).toBe('high');
    expect(result.summary.totalAmountLost).toBe(150_000);
  });

  it('gives verified reports more weight than pending ones', () => {
    const verified = assess([report({ status: 'verified' })]).riskScore;
    const pending = assess([report({ status: 'pending' })]).riskScore;
    expect(verified).toBeGreaterThan(pending);
  });

  it('gives recent reports more weight than old ones', () => {
    const recent = assess([report({ createdAt: daysAgo(2) })]).riskScore;
    const old = assess([report({ createdAt: daysAgo(400) })]).riskScore;
    expect(recent).toBeGreaterThan(old);
  });

  it('excludes rejected reports from the score but still counts them', () => {
    const result = assess([report({ status: 'rejected', amountLost: 90_000 })]);
    expect(result.riskScore).toBe(0);
    expect(result.summary.rejectedReports).toBe(1);
    expect(result.summary.totalReports).toBe(0);
  });

  it('shows diminishing returns on the report count component', () => {
    const score = (n) => assess(Array.from({ length: n }, () => report())).breakdown.reports.score;
    expect(score(2) - score(1)).toBeGreaterThan(score(10) - score(9));
  });

  it('adds heuristic points even without reports, but stays low', () => {
    const result = assess([], { kind: 'url', value: 'http://sbi-kyc.xyz/login', normalized: 'sbi-kyc.xyz' });
    expect(result.breakdown.identifierPatterns.score).toBeGreaterThan(0);
    expect(result.riskLevel).toBe('low');
    expect(result.confidence).toBe('medium');
  });

  it('keeps the score within 0 to 100 and the breakdown consistent', () => {
    const reports = Array.from({ length: 200 }, () => report({ amountLost: 5_000_000, upvoteCount: 100 }));
    const result = assess(reports, { kind: 'url', value: 'http://10.0.0.1/kyc-prize-free', normalized: '10.0.0.1' });
    expect(result.riskScore).toBeLessThanOrEqual(100);
    Object.values(result.breakdown).forEach((b) => expect(b.score).toBeLessThanOrEqual(b.max));
  });

  it('reports the most common scam types and first/last dates', () => {
    const result = assess([
      report({ scamType: 'fake_job', createdAt: daysAgo(10) }),
      report({ scamType: 'fake_job', createdAt: daysAgo(5) }),
      report({ scamType: 'lottery', createdAt: daysAgo(1) }),
    ]);
    expect(result.summary.topScamTypes[0]).toEqual({ scamType: 'fake_job', count: 2 });
    expect(result.summary.firstReportedAt).toBe(daysAgo(10).toISOString());
    expect(result.summary.lastReportedAt).toBe(daysAgo(1).toISOString());
  });
});

describe('resolveLevel', () => {
  it.each([
    [0, 'low'], [29, 'low'], [30, 'medium'], [59, 'medium'], [60, 'high'], [79, 'high'], [80, 'critical'], [100, 'critical'],
  ])('maps %i to %s', (score, level) => {
    expect(resolveLevel(score)).toBe(level);
  });
});
