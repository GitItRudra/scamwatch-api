/*
 * End-to-end check of a RUNNING server and its database.
 *
 *   1. start the server with rate limits off:  DISABLE_RATE_LIMITS=true npm start
 *   2. in another terminal:                    npm run test:e2e
 *
 * Needs the seeded moderator and admin accounts (npm run seed). API_URL defaults to http://localhost:5000.
 * Everything it creates is cleaned up, except the throwaway user accounts.
 */
const assert = require('node:assert/strict');

const BASE = (process.env.API_URL || 'http://localhost:5000').replace(/\/$/, '');
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123';
const MODERATOR_EMAIL = process.env.E2E_MODERATOR_EMAIL || 'moderator@scamwatch.local';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@scamwatch.local';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

let passed = 0;
const failed = [];

async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed.push(name);
    console.log(`  FAIL  ${name}\n          ${String(err.message).split('\n')[0]}`);
  }
}

async function call(method, path, { token, body, form } = {}) {
  const init = { method, headers: {} };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (body) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  if (form) init.body = form;
  const res = await fetch(BASE + path, init);
  const isJson = (res.headers.get('content-type') || '').includes('json');
  return { status: res.status, headers: res.headers, data: isJson ? await res.json() : await res.text() };
}

const expectStatus = (res, status) =>
  assert.equal(res.status, status, `expected HTTP ${status} but got ${res.status}: ${JSON.stringify(res.data).slice(0, 160)}`);
const expectCode = (res, status, code) => {
  expectStatus(res, status);
  assert.equal(res.data.error?.code, code, `expected error code ${code}, got ${res.data.error?.code}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  console.log(`Testing ${BASE}\n`);

  const probe = await call('POST', '/api/auth/login', { body: { email: 'probe@example.com', password: 'x' } }).catch(() => null);
  if (!probe) {
    console.log('Cannot reach the server. Start it first with: DISABLE_RATE_LIMITS=true npm start');
    process.exit(1);
  }
  if (probe.headers.get('ratelimit') || probe.headers.get('ratelimit-policy')) {
    console.log('Rate limiting is active, which would make this test fail halfway.');
    console.log('Restart the server with DISABLE_RATE_LIMITS=true (PowerShell: $env:DISABLE_RATE_LIMITS="true"; npm start).');
    process.exit(1);
  }

  const run = String(Date.now()).slice(-8);
  const phone = `7${run}1`;
  const password = `E2ePass${run}`;
  const emailA = `e2e.a.${run}@demo.scamwatch.local`;
  const emailB = `e2e.b.${run}@demo.scamwatch.local`;
  const s = {};

  console.log('Basics');
  await step('health check reports a connected database', async () => {
    const r = await call('GET', '/health');
    expectStatus(r, 200);
    assert.equal(r.data.database, 'connected');
  });
  await step('front end is served at /', async () => {
    const r = await call('GET', '/');
    expectStatus(r, 200);
    assert.match(r.data, /ScamWatch/);
  });
  await step('Swagger UI is served', async () => expectStatus(await call('GET', '/api/docs/'), 200));
  await step('unknown API route returns a JSON 404', async () => {
    const r = await call('GET', '/api/does-not-exist');
    expectStatus(r, 404);
    assert.equal(r.data.success, false);
  });

  console.log('\nAuthentication and validation');
  await step('weak password is rejected (422)', async () =>
    expectStatus(await call('POST', '/api/auth/register', { body: { name: 'Test', email: emailA, password: 'short' } }), 422));
  await step('register user A', async () => {
    const r = await call('POST', '/api/auth/register', { body: { name: 'E2E User A', email: emailA, password } });
    expectStatus(r, 201);
    assert.ok(r.data.data.accessToken && r.data.data.refreshToken);
    assert.equal(r.data.data.user.password, undefined, 'password must never be returned');
    assert.equal(r.data.data.user.role, 'user');
    s.a = r.data.data;
  });
  await step('register user B', async () => {
    const r = await call('POST', '/api/auth/register', { body: { name: 'E2E User B', email: emailB, password } });
    expectStatus(r, 201);
    s.b = r.data.data;
  });
  await step('registering the same email again is rejected (409)', async () =>
    expectStatus(await call('POST', '/api/auth/register', { body: { name: 'Dup', email: emailA, password } }), 409));
  await step('wrong password is rejected (401)', async () =>
    expectCode(await call('POST', '/api/auth/login', { body: { email: emailA, password: 'WrongPass123' } }), 401, 'INVALID_CREDENTIALS'));
  await step('profile needs a token (401)', async () => expectStatus(await call('GET', '/api/auth/me'), 401));
  await step('garbage token is rejected', async () =>
    expectCode(await call('GET', '/api/auth/me', { token: 'not.a.token' }), 401, 'TOKEN_INVALID'));
  await step('profile returns the logged in user', async () => {
    const r = await call('GET', '/api/auth/me', { token: s.a.accessToken });
    expectStatus(r, 200);
    assert.equal(r.data.data.user.email, emailA);
  });
  await step('malformed id is rejected by validation (422)', async () =>
    expectStatus(await call('GET', '/api/reports/xyz'), 422));

  console.log('\nFiling a report');
  await step('risk check on a brand new number shows no reports', async () => {
    const r = await call('POST', '/api/risk/check', { body: { kind: 'phone', value: phone } });
    expectStatus(r, 200);
    assert.equal(r.data.data.summary.totalReports, 0);
    s.baseScore = r.data.data.riskScore;
  });
  await step('invalid phone number is rejected (422)', async () =>
    expectStatus(await call('POST', '/api/reports', { token: s.a.accessToken, body: reportBody('123') }), 422));
  await step('filing a report needs login (401)', async () =>
    expectStatus(await call('POST', '/api/reports', { body: reportBody(`+91 ${phone.slice(0, 5)} ${phone.slice(5)}`) }), 401));
  await step('file a report (starts as pending)', async () => {
    const r = await call('POST', '/api/reports', { token: s.a.accessToken, body: reportBody(`+91 ${phone.slice(0, 5)} ${phone.slice(5)}`) });
    expectStatus(r, 201);
    assert.equal(r.data.data.report.status, 'pending');
    assert.equal(r.data.data.similarReports, 0);
    s.report = r.data.data.report.id;
  });
  await step('same report twice is blocked as a duplicate (409)', async () =>
    expectCode(await call('POST', '/api/reports', { token: s.a.accessToken, body: reportBody(phone) }), 409, 'DUPLICATE_REPORT'));
  await step('pending report is hidden from anonymous visitors (404)', async () =>
    expectStatus(await call('GET', `/api/reports/${s.report}`), 404));
  await step('pending report is hidden from other users (404)', async () =>
    expectStatus(await call('GET', `/api/reports/${s.report}`, { token: s.b.accessToken }), 404));
  await step('pending report is not in the public feed', async () => {
    const r = await call('GET', `/api/reports?identifierKind=phone&identifier=${phone}`);
    expectStatus(r, 200);
    assert.equal(r.data.meta.total, 0);
  });
  await step('owner sees it under "my reports"', async () => {
    const r = await call('GET', '/api/reports/mine?limit=50', { token: s.a.accessToken });
    expectStatus(r, 200);
    assert.ok(r.data.data.some((x) => x.id === s.report));
  });
  await step('risk check counts the pending report with reduced weight', async () => {
    const r = await call('POST', '/api/risk/check', { body: { kind: 'phone', value: phone } });
    assert.equal(r.data.data.summary.pendingReports, 1);
    assert.equal(r.data.data.summary.verifiedReports, 0);
    assert.ok(r.data.data.riskScore > s.baseScore);
    s.pendingScore = r.data.data.riskScore;
  });
  await step('another user cannot edit it', async () =>
    expectStatus(await call('PATCH', `/api/reports/${s.report}`, { token: s.b.accessToken, body: { title: 'Hijacked title for this report' } }), 404));
  await step('owner can edit it', async () => {
    const r = await call('PATCH', `/api/reports/${s.report}`, { token: s.a.accessToken, body: { amountLost: 4500 } });
    expectStatus(r, 200);
    assert.equal(r.data.data.amountLost, 4500);
  });

  console.log('\nEvidence upload');
  await step('upload a valid PNG', async () => {
    const form = new FormData();
    form.append('files', new Blob([PNG], { type: 'image/png' }), 'proof.png');
    const r = await call('POST', `/api/reports/${s.report}/evidence`, { token: s.a.accessToken, form });
    expectStatus(r, 201);
    s.evidence = r.data.data[0].id;
  });
  await step('a text file pretending to be a PNG is rejected', async () => {
    const form = new FormData();
    form.append('files', new Blob(['definitely not an image'], { type: 'image/png' }), 'fake.png');
    expectStatus(await call('POST', `/api/reports/${s.report}/evidence`, { token: s.a.accessToken, form }), 422);
  });
  await step('owner can download the evidence', async () =>
    expectStatus(await call('GET', `/api/reports/${s.report}/evidence/${s.evidence}`, { token: s.a.accessToken }), 200));
  await step('other users cannot download it', async () =>
    assert.ok([403, 404].includes((await call('GET', `/api/reports/${s.report}/evidence/${s.evidence}`, { token: s.b.accessToken })).status)));

  console.log('\nModeration');
  await step('moderator logs in', async () => {
    const r = await call('POST', '/api/auth/login', { body: { email: MODERATOR_EMAIL, password: SEED_PASSWORD } });
    expectStatus(r, 200);
    s.mod = r.data.data;
  });
  await step('normal users cannot open the queue (403)', async () =>
    expectStatus(await call('GET', '/api/moderation/queue', { token: s.b.accessToken }), 403));
  await step('the report is waiting in the moderation queue', async () => {
    const r = await call('GET', '/api/moderation/queue?limit=50', { token: s.mod.accessToken });
    expectStatus(r, 200);
    assert.ok(r.data.data.some((x) => x.id === s.report));
  });
  await step('rejecting without a note is refused (422)', async () =>
    expectStatus(await call('PATCH', `/api/moderation/reports/${s.report}`, { token: s.mod.accessToken, body: { status: 'rejected' } }), 422));
  await step('moderator verifies the report', async () => {
    const r = await call('PATCH', `/api/moderation/reports/${s.report}`, { token: s.mod.accessToken, body: { status: 'verified', note: 'End to end test' } });
    expectStatus(r, 200);
    assert.equal(r.data.data.status, 'verified');
  });
  await step('a second review of the same report is refused (409)', async () =>
    expectCode(await call('PATCH', `/api/moderation/reports/${s.report}`, { token: s.mod.accessToken, body: { status: 'verified' } }), 409, 'ALREADY_REVIEWED'));

  console.log('\nPublic view and search');
  await step('verified report is public, with evidence and moderation details hidden', async () => {
    const r = await call('GET', `/api/reports/${s.report}`);
    expectStatus(r, 200);
    assert.equal(r.data.data.status, 'verified');
    assert.equal(r.data.data.evidenceCount, 1);
    assert.equal(r.data.data.evidence, undefined);
    assert.equal(r.data.data.moderation, undefined);
  });
  await step('public feed filters by identifier', async () => {
    const r = await call('GET', `/api/reports?identifierKind=phone&identifier=${phone}`);
    assert.equal(r.data.meta.total, 1);
  });
  await step('full text search finds it', async () => {
    const r = await call('GET', `/api/reports?q=ref${run}`);
    expectStatus(r, 200);
    assert.ok(r.data.data.some((x) => x.id === s.report));
  });
  await step('score rises once the report is verified', async () => {
    const r = await call('POST', '/api/risk/check', { body: { kind: 'phone', value: phone } });
    assert.equal(r.data.data.summary.verifiedReports, 1);
    assert.ok(r.data.data.riskScore > s.pendingScore);
  });
  await step('a differently written number resolves to the same record', async () => {
    const r = await call('POST', '/api/risk/check', { body: { kind: 'phone', value: `+91 ${phone}` } });
    assert.equal(r.data.data.summary.totalReports, 1);
  });
  await step('bulk risk check handles good and bad entries together', async () => {
    const r = await call('POST', '/api/risk/check/bulk', { body: { items: [{ kind: 'phone', value: phone }, { kind: 'phone', value: '123' }] } });
    expectStatus(r, 200);
    assert.ok(r.data.data[0].result);
    assert.ok(r.data.data[1].error);
  });

  console.log('\nCommunity');
  await step('user B upvotes the report', async () => {
    const r = await call('POST', `/api/reports/${s.report}/upvote`, { token: s.b.accessToken });
    expectStatus(r, 200);
    assert.equal(r.data.data.upvoted, true);
    assert.equal(r.data.data.upvoteCount, 1);
  });
  await step('upvoting again removes the upvote', async () => {
    const r = await call('POST', `/api/reports/${s.report}/upvote`, { token: s.b.accessToken });
    assert.equal(r.data.data.upvoted, false);
    assert.equal(r.data.data.upvoteCount, 0);
  });
  await step('the reporter cannot upvote their own report (403)', async () =>
    expectStatus(await call('POST', `/api/reports/${s.report}/upvote`, { token: s.a.accessToken }), 403));
  await step('user B comments on the verified report', async () => {
    const r = await call('POST', `/api/reports/${s.report}/comments`, { token: s.b.accessToken, body: { text: 'Thanks for the warning.' } });
    expectStatus(r, 201);
    s.comment = r.data.data.id;
  });
  await step('comments are listed', async () => {
    const r = await call('GET', `/api/reports/${s.report}/comments`);
    assert.equal(r.data.meta.total, 1);
  });
  await step('only the author or staff can delete a comment (403)', async () =>
    expectStatus(await call('DELETE', `/api/comments/${s.comment}`, { token: s.a.accessToken }), 403));
  await step('the author deletes their comment', async () =>
    expectStatus(await call('DELETE', `/api/comments/${s.comment}`, { token: s.b.accessToken }), 204));

  console.log('\nOwnership rules');
  await step('a verified report is locked against edits (409)', async () =>
    expectCode(await call('PATCH', `/api/reports/${s.report}`, { token: s.a.accessToken, body: { amountLost: 1 } }), 409, 'REPORT_LOCKED'));
  await step('owner cannot delete a verified report (409)', async () =>
    expectStatus(await call('DELETE', `/api/reports/${s.report}`, { token: s.a.accessToken }), 409));
  await step('comments are closed on pending reports (404)', async () => {
    const created = await call('POST', '/api/reports', { token: s.a.accessToken, body: { ...reportBody(`e2e${run}@okaxis`, 'upi'), scamType: 'upi_fraud' } });
    expectStatus(created, 201);
    s.report2 = created.data.data.report.id;
    expectStatus(await call('POST', `/api/reports/${s.report2}/comments`, { token: s.b.accessToken, body: { text: 'Hello there' } }), 404);
  });
  await step('owner can delete a pending report', async () => {
    expectStatus(await call('DELETE', `/api/reports/${s.report2}`, { token: s.a.accessToken }), 204);
    expectStatus(await call('GET', `/api/reports/${s.report2}`, { token: s.a.accessToken }), 404);
  });

  console.log('\nStatistics and administration');
  await step('public statistics are available', async () => {
    const r = await call('GET', '/api/stats/overview?months=6');
    expectStatus(r, 200);
    assert.ok(r.data.data.totals.verifiedReports >= 1);
    assert.equal(r.data.data.monthlyTrend.length, 6);
  });
  await step('normal users cannot open the admin dashboard (403)', async () =>
    expectStatus(await call('GET', '/api/admin/dashboard', { token: s.b.accessToken }), 403));
  await step('admin logs in', async () => {
    const r = await call('POST', '/api/auth/login', { body: { email: ADMIN_EMAIL, password: SEED_PASSWORD } });
    expectStatus(r, 200);
    s.admin = r.data.data;
  });
  await step('admin dashboard returns operational numbers', async () => {
    const r = await call('GET', '/api/admin/dashboard', { token: s.admin.accessToken });
    expectStatus(r, 200);
    assert.ok(r.data.data.reports.total >= 1);
  });
  await step('the verification was written to the audit log', async () => {
    const r = await call('GET', '/api/admin/audit-logs?action=report.reviewed&limit=50', { token: s.admin.accessToken });
    expectStatus(r, 200);
    assert.ok(r.data.data.some((e) => e.entityId === s.report));
  });
  await step('admin can search users', async () => {
    const r = await call('GET', `/api/admin/users?q=${encodeURIComponent(`e2e.b.${run}`)}`, { token: s.admin.accessToken });
    expectStatus(r, 200);
    assert.equal(r.data.data.length, 1);
  });
  await step('admin cannot change their own role (403)', async () =>
    expectCode(await call('PATCH', `/api/admin/users/${s.admin.user.id}/role`, { token: s.admin.accessToken, body: { role: 'user' } }), 403, 'SELF_MODIFICATION'));
  await step('admin promotes user B to moderator and back', async () => {
    let r = await call('PATCH', `/api/admin/users/${s.b.user.id}/role`, { token: s.admin.accessToken, body: { role: 'moderator' } });
    expectStatus(r, 200);
    expectStatus(await call('GET', '/api/moderation/queue', { token: s.b.accessToken }), 200);
    r = await call('PATCH', `/api/admin/users/${s.b.user.id}/role`, { token: s.admin.accessToken, body: { role: 'user' } });
    expectStatus(r, 200);
    expectStatus(await call('GET', '/api/moderation/queue', { token: s.b.accessToken }), 403);
  });
  await step('suspending a user blocks them immediately', async () => {
    expectStatus(await call('PATCH', `/api/admin/users/${s.b.user.id}/status`, { token: s.admin.accessToken, body: { status: 'suspended' } }), 200);
    expectCode(await call('GET', '/api/auth/me', { token: s.b.accessToken }), 403, 'ACCOUNT_SUSPENDED');
    expectCode(await call('POST', '/api/auth/login', { body: { email: emailB, password } }), 403, 'ACCOUNT_SUSPENDED');
    expectStatus(await call('PATCH', `/api/admin/users/${s.b.user.id}/status`, { token: s.admin.accessToken, body: { status: 'active' } }), 200);
    expectStatus(await call('GET', '/api/auth/me', { token: s.b.accessToken }), 200);
  });
  await step('admin can delete a verified report', async () => {
    expectStatus(await call('DELETE', `/api/reports/${s.report}`, { token: s.admin.accessToken }), 204);
    expectStatus(await call('GET', `/api/reports/${s.report}`), 404);
  });

  console.log('\nSession security');
  await step('refresh token rotation issues a new pair', async () => {
    const r = await call('POST', '/api/auth/refresh', { body: { refreshToken: s.a.refreshToken } });
    expectStatus(r, 200);
    s.oldRefresh = s.a.refreshToken;
    s.a = { ...s.a, ...r.data.data };
  });
  await step('reusing an old refresh token is detected (401)', async () =>
    expectCode(await call('POST', '/api/auth/refresh', { body: { refreshToken: s.oldRefresh } }), 401, 'TOKEN_REUSED'));
  await step('reuse detection revokes the whole session family', async () =>
    expectStatus(await call('POST', '/api/auth/refresh', { body: { refreshToken: s.a.refreshToken } }), 401));
  await step('password change invalidates old tokens', async () => {
    const login = await call('POST', '/api/auth/login', { body: { email: emailA, password } });
    expectStatus(login, 200);
    s.a = login.data.data;
    await sleep(1200);
    expectStatus(await call('PATCH', '/api/auth/me/password', { token: s.a.accessToken, body: { currentPassword: 'WrongPass123', newPassword: `${password}x` } }), 401);
    const changed = await call('PATCH', '/api/auth/me/password', { token: s.a.accessToken, body: { currentPassword: password, newPassword: `${password}x` } });
    expectStatus(changed, 200);
    expectCode(await call('GET', '/api/auth/me', { token: s.a.accessToken }), 401, 'TOKEN_REVOKED');
    expectStatus(await call('GET', '/api/auth/me', { token: changed.data.data.accessToken }), 200);
    expectStatus(await call('POST', '/api/auth/login', { body: { email: emailA, password } }), 401);
    s.a = changed.data.data;
  });
  await step('logout revokes the refresh token', async () => {
    expectStatus(await call('POST', '/api/auth/logout', { body: { refreshToken: s.a.refreshToken } }), 204);
    expectStatus(await call('POST', '/api/auth/refresh', { body: { refreshToken: s.a.refreshToken } }), 401);
  });
  await step('five wrong passwords lock the account (423)', async () => {
    const email = `e2e.c.${run}@demo.scamwatch.local`;
    expectStatus(await call('POST', '/api/auth/register', { body: { name: 'E2E User C', email, password } }), 201);
    for (let i = 0; i < 5; i += 1) await call('POST', '/api/auth/login', { body: { email, password: 'WrongPass123' } });
    expectCode(await call('POST', '/api/auth/login', { body: { email, password } }), 423, 'ACCOUNT_LOCKED');
  });

  const seeded = await call('GET', '/api/reports?limit=1').catch(() => null);
  if (seeded?.data?.meta) console.log(`\nInfo: the public feed currently holds ${seeded.data.meta.total} verified reports.`);

  console.log(`\n${passed} passed, ${failed.length} failed`);
  if (failed.length) failed.forEach((name) => console.log(`  - ${name}`));
  process.exit(failed.length ? 1 : 0);

  function reportBody(value, kind = 'phone') {
    return {
      scamType: 'fake_job',
      title: `Fake recruiter asked for a training fee ref${run}`,
      description: 'They contacted me on WhatsApp offering a data entry job and asked for a refundable fee before starting work.',
      identifier: { kind, value },
      amountLost: 3000,
    };
  }
})();
