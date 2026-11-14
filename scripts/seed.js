/* Creates an admin and a moderator, and with --demo a regular user plus sample reports. */
const { connectDatabase, disconnectDatabase } = require('../src/config/db');
const config = require('../src/config/env');
const User = require('../src/models/User');
const Report = require('../src/models/Report');
const { normalizeIdentifier } = require('../src/utils/identifier');
const { ROLES, REPORT_STATUS } = require('../src/constants');

const withDemo = process.argv.includes('--demo');
const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@scamwatch.local';
const adminPassword = process.env.SEED_ADMIN_PASSWORD;

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);

async function upsertUser({ name, email, password, role }) {
  const existing = await User.findOne({ email });
  if (existing) return existing;
  return User.create({ name, email, password, role });
}

const SAMPLE_REPORTS = [
  { scamType: 'upi_fraud', title: 'Fake refund collect request on UPI', identifier: { kind: 'upi', value: 'refund.support@okaxis' }, amountLost: 12000, status: REPORT_STATUS.VERIFIED, ageDays: 3, upvotes: 6 },
  { scamType: 'upi_fraud', title: 'Asked me to approve a payment to receive a refund', identifier: { kind: 'upi', value: 'refund.support@okaxis' }, amountLost: 4500, status: REPORT_STATUS.VERIFIED, ageDays: 9, upvotes: 3 },
  { scamType: 'kyc_fraud', title: 'SMS claiming my bank account will be blocked today', identifier: { kind: 'url', value: 'http://sbi-kyc-update.xyz/login' }, amountLost: 38000, status: REPORT_STATUS.VERIFIED, ageDays: 5, upvotes: 9 },
  { scamType: 'phishing', title: 'Lookalike banking login page asking for card details', identifier: { kind: 'url', value: 'sbi-kyc-update.xyz' }, amountLost: 0, status: REPORT_STATUS.PENDING, ageDays: 1, upvotes: 0 },
  { scamType: 'fake_job', title: 'Work-from-home job that asked for a registration fee', identifier: { kind: 'phone', value: '+91 98765 43210' }, amountLost: 2500, status: REPORT_STATUS.VERIFIED, ageDays: 20, upvotes: 2 },
  { scamType: 'lottery', title: 'Caller said I won a prize and asked for a processing fee', identifier: { kind: 'phone', value: '9876543210' }, amountLost: 7000, status: REPORT_STATUS.PENDING, ageDays: 2, upvotes: 0 },
];

(async () => {
  if (!adminPassword && config.isProduction) {
    throw new Error('Set SEED_ADMIN_PASSWORD before seeding in production');
  }
  const password = adminPassword || 'ChangeMe123';

  await connectDatabase();

  await upsertUser({ name: 'Platform Admin', email: adminEmail, password, role: ROLES.ADMIN });
  await upsertUser({ name: 'Moderator One', email: 'moderator@scamwatch.local', password, role: ROLES.MODERATOR });
  console.log(`Admin:     ${adminEmail}`);
  console.log('Moderator: moderator@scamwatch.local');

  if (withDemo) {
    const reporterA = await upsertUser({ name: 'Demo Reporter A', email: 'reporter.a@scamwatch.local', password, role: ROLES.USER });
    const reporterB = await upsertUser({ name: 'Demo Reporter B', email: 'reporter.b@scamwatch.local', password, role: ROLES.USER });
    const moderator = await User.findOne({ email: 'moderator@scamwatch.local' });

    let created = 0;
    for (const [index, sample] of SAMPLE_REPORTS.entries()) {
      const identifier = normalizeIdentifier(sample.identifier.kind, sample.identifier.value);
      const reporter = index % 2 === 0 ? reporterA : reporterB;
      const exists = await Report.exists({
        reporter: reporter._id,
        scamType: sample.scamType,
        'identifier.kind': identifier.kind,
        'identifier.normalized': identifier.normalized,
      });
      if (exists) continue;

      const createdAt = daysAgo(sample.ageDays);
      await Report.collection.insertOne({
        reporter: reporter._id,
        isAnonymous: false,
        scamType: sample.scamType,
        title: sample.title,
        description: `${sample.title}. The caller created urgency and pushed me to act immediately without verifying.`,
        identifier,
        amountLost: sample.amountLost,
        evidence: [],
        status: sample.status,
        ...(sample.status === REPORT_STATUS.VERIFIED && {
          moderation: { reviewedBy: moderator._id, reviewedAt: createdAt, note: 'Matches multiple independent reports' },
        }),
        upvoteCount: sample.upvotes,
        commentCount: 0,
        createdAt,
        updatedAt: createdAt,
      });
      created += 1;
    }
    console.log(`Demo users: reporter.a@scamwatch.local, reporter.b@scamwatch.local`);
    console.log(`Demo reports created: ${created}`);
  }

  console.log(`Password for seeded accounts: ${adminPassword ? '(from SEED_ADMIN_PASSWORD)' : password}`);
  await disconnectDatabase();
})().catch(async (err) => {
  console.error(err.message);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
