/*
 * Loads the large demo dataset (100 reports, plus votes, comments and audit entries).
 *
 * WARNING: this first CLEARS all reports, votes, comments and audit log entries so the result is
 * always exactly the same dataset. User accounts are kept. Run it only on a demo database.
 */
const bcrypt = require('bcryptjs');
const config = require('../src/config/env');
const { connectDatabase, disconnectDatabase } = require('../src/config/db');
const User = require('../src/models/User');
const Report = require('../src/models/Report');
const Vote = require('../src/models/Vote');
const Comment = require('../src/models/Comment');
const AuditLog = require('../src/models/AuditLog');
const { buildDataset, DEMO_USER_NAMES } = require('./data/bulkDataset');

const DEMO_DOMAIN = '@demo.scamwatch.local';

async function ensureUser({ name, email, role }, password) {
  return (await User.findOne({ email })) || User.create({ name, email, password, role });
}

(async () => {
  const envPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!envPassword && config.isProduction) throw new Error('Set SEED_ADMIN_PASSWORD before seeding in production');
  const password = envPassword || 'ChangeMe123';

  await connectDatabase();
  await Promise.all([User.init(), Report.init(), Vote.init(), Comment.init(), AuditLog.init()]);

  const admin = await ensureUser({ name: 'Platform Admin', email: process.env.SEED_ADMIN_EMAIL || 'admin@scamwatch.local', role: 'admin' }, password);
  const moderator = await ensureUser({ name: 'Moderator One', email: 'moderator@scamwatch.local', role: 'moderator' }, password);
  const reporterA = await ensureUser({ name: 'Demo Reporter A', email: 'reporter.a@scamwatch.local', role: 'user' }, password);
  const reporterB = await ensureUser({ name: 'Demo Reporter B', email: 'reporter.b@scamwatch.local', role: 'user' }, password);

  await User.deleteMany({ email: { $regex: `${DEMO_DOMAIN.replace('.', '\\.')}$` } });
  const hash = bcrypt.hashSync(password, config.bcryptRounds);
  const joined = new Date(Date.now() - 160 * 86_400_000);
  const demoUsers = DEMO_USER_NAMES.map((name, i) => ({
    name,
    email: `user${String(i + 1).padStart(2, '0')}${DEMO_DOMAIN}`,
    password: hash, role: 'user', status: 'active', failedLoginAttempts: 0, createdAt: joined, updatedAt: joined, __v: 0,
  }));
  const inserted = await User.collection.insertMany(demoUsers);

  const userIds = [reporterA._id, reporterB._id, ...Object.values(inserted.insertedIds)];
  const data = buildDataset({ userIds, moderatorId: moderator._id, adminId: admin._id });

  await Promise.all([Report.deleteMany({}), Vote.deleteMany({}), Comment.deleteMany({}), AuditLog.deleteMany({})]);
  await Report.collection.insertMany(data.reports);
  await Vote.collection.insertMany(data.votes);
  if (data.comments.length) await Comment.collection.insertMany(data.comments);
  await AuditLog.collection.insertMany(data.auditLogs);

  const count = (key, value) => data.reports.filter((r) => r[key] === value).length;
  console.log(`Reports: ${data.reports.length} (verified ${count('status', 'verified')}, pending ${count('status', 'pending')}, rejected ${count('status', 'rejected')})`);
  console.log(`Votes: ${data.votes.length}, comments: ${data.comments.length}, audit entries: ${data.auditLogs.length}`);
  console.log(`Accounts: admin ${admin.email}, moderator ${moderator.email}, reporters reporter.a/b@scamwatch.local, user01..user12${DEMO_DOMAIN}`);
  console.log(`Password for all seeded accounts: ${envPassword ? '(from SEED_ADMIN_PASSWORD)' : password}`);
  await disconnectDatabase();
})().catch(async (err) => {
  console.error(err.message);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
