const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `INR ${Number(n || 0).toLocaleString('en-IN')}`;
const pretty = (s) => String(s).replace(/_/g, ' ');
const date = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const SCAM_TYPES = ['phishing', 'upi_fraud', 'kyc_fraud', 'fake_job', 'lottery', 'investment', 'loan_app', 'romance', 'tech_support', 'impersonation', 'online_shopping', 'other'];
const KINDS = { phone: 'Phone number', upi: 'UPI ID', email: 'Email address', url: 'Website link', bank_account: 'Bank account' };
const PARTS = { reports: 'Reports on record', financialImpact: 'Money lost', communitySignal: 'Community upvotes', recentMomentum: 'Recent activity', identifierPatterns: 'Suspicious patterns' };
const DEMO = [['Reporter', 'reporter.a@scamwatch.local'], ['Moderator', 'moderator@scamwatch.local'], ['Admin', 'admin@scamwatch.local']];

const state = { access: sessionStorage.getItem('a'), refresh: sessionStorage.getItem('r'), user: JSON.parse(sessionStorage.getItem('u') || 'null'), prefill: null };

function setSession(s, user) {
  state.access = s?.accessToken || null; state.refresh = s?.refreshToken || null; state.user = s ? (user || state.user) : null;
  ['a', 'r', 'u'].forEach((k) => sessionStorage.removeItem(k));
  if (s) { sessionStorage.setItem('a', state.access); sessionStorage.setItem('r', state.refresh); sessionStorage.setItem('u', JSON.stringify(state.user)); }
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('show'), 2600);
}

async function refreshSession() {
  if (!state.refresh) return false;
  const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: state.refresh }) });
  if (!res.ok) { setSession(null); return false; }
  setSession((await res.json()).data); return true;
}

// Access tokens last 15 minutes; this renews them silently so a demo never breaks mid-way
async function api(path, { method = 'GET', body, auth = true } = {}, retry = true) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (auth && state.access) headers.Authorization = `Bearer ${state.access}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return {};
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && json.error?.code === 'TOKEN_EXPIRED' && retry && await refreshSession()) return api(path, { method, body, auth }, false);
  if (!res.ok) { const e = new Error(json.error?.message || 'Request failed'); e.details = json.error?.details; throw e; }
  return json;
}

const errBox = (e) => `<div class="err">${esc(e.message)}${(e.details || []).map((d) => `<br>${esc(d.field)}: ${esc(d.message)}`).join('')}</div>`;
const options = (list, labels) => list.map((v) => `<option value="${v}">${esc(labels ? labels[v] : pretty(v))}</option>`).join('');
const isStaff = () => ['moderator', 'admin'].includes(state.user?.role);

/* ---------- views ---------- */
const views = {
  check() {
    $('#view').innerHTML = `
      <h1>Check before you pay</h1>
      <p class="sub">Look up a phone number, UPI ID, email, link or bank account against community reports.</p>
      <form class="card" id="f">
        <div class="row"><div class="fit"><label for="k">What are you checking?</label><select id="k">${options(Object.keys(KINDS), KINDS)}</select></div>
        <div><label for="v">Value</label><input id="v" required minlength="3" placeholder="e.g. refund.support@okaxis"></div>
        <div class="fit"><label>&nbsp;</label><button>Check risk</button></div></div>
      </form><div id="out"></div>`;
    if (state.prefill) { $('#k').value = state.prefill[0]; $('#v').value = state.prefill[1]; state.prefill = null; run(); }
    $('#f').onsubmit = (e) => { e.preventDefault(); run(); };
    async function run() {
      const out = $('#view #out'); out.innerHTML = '<p class="empty">Checking…</p>';
      try { out.innerHTML = verdict((await api('/risk/check', { method: 'POST', body: { kind: $('#k').value, value: $('#v').value }, auth: false })).data); }
      catch (e) { out.innerHTML = errBox(e); }
    }
  },

  async feed() {
    $('#view').innerHTML = `<h1>Verified scam reports</h1><p class="sub">Every report here was reviewed by a moderator.</p>
      <form class="card row" id="f"><div><label for="q">Search</label><input id="q" placeholder="keyword"></div>
      <div><label for="t">Scam type</label><select id="t"><option value="">All types</option>${options(SCAM_TYPES)}</select></div>
      <div><label for="s">Sort by</label><select id="s"><option value="newest">Newest</option><option value="mostUpvoted">Most upvoted</option><option value="highestLoss">Highest loss</option></select></div>
      <div class="fit"><label>&nbsp;</label><button>Search</button></div></form><div id="list"></div><div class="pager" id="pg"></div>`;
    let page = 1;
    const load = async () => {
      const p = new URLSearchParams({ page, limit: 6, sort: $('#s').value });
      if ($('#q').value.trim().length > 1) p.set('q', $('#q').value.trim());
      if ($('#t').value) p.set('scamType', $('#t').value);
      try {
        const r = await api(`/reports?${p}`);
        $('#list').innerHTML = r.data.length ? r.data.map((x) => reportCard(x, 'feed')).join('') : '<p class="empty">No reports match. Try a different search.</p>';
        $('#pg').innerHTML = `<button class="ghost sm" data-p="-1" ${r.meta.hasPrevPage ? '' : 'disabled'}>Previous</button>Page ${r.meta.page} of ${r.meta.totalPages}<button class="ghost sm" data-p="1" ${r.meta.hasNextPage ? '' : 'disabled'}>Next</button>`;
      } catch (e) { $('#list').innerHTML = errBox(e); }
    };
    $('#f').onsubmit = (e) => { e.preventDefault(); page = 1; load(); };
    $('#view').onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.p) { page += Number(b.dataset.p); load(); }
      if (b.dataset.check) { state.prefill = b.dataset.check.split('|'); location.hash = '#/check'; }
      if (b.dataset.up) {
        if (!state.user) { toast('Log in to upvote'); return; }
        try { const r = (await api(`/reports/${b.dataset.up}/upvote`, { method: 'POST' })).data; b.textContent = `${r.upvoted ? 'Upvoted' : 'Upvote'} (${r.upvoteCount})`; }
        catch (err) { toast(err.message); }
      }
    };
    load();
  },

  report() {
    if (!state.user) return needLogin('file a report');
    $('#view').innerHTML = `<h1>Report a scam</h1><p class="sub">Your report is reviewed by a moderator before it becomes public.</p>
      <form class="card" id="f">
        <div class="row"><div><label for="st">Type of scam</label><select id="st">${options(SCAM_TYPES)}</select></div>
        <div><label for="ik">Reporting a</label><select id="ik">${options(Object.keys(KINDS), KINDS)}</select></div>
        <div><label for="iv">Their number, ID or link</label><input id="iv" required minlength="3"></div></div>
        <label for="ti">Short title</label><input id="ti" required minlength="8" maxlength="120" placeholder="What happened, in one line">
        <label for="de">What happened</label><textarea id="de" required minlength="30" placeholder="At least 30 characters. Say how they contacted you and what they asked for."></textarea>
        <div class="row"><div><label for="am">Amount lost (INR)</label><input id="am" type="number" min="0" value="0"></div>
        <div><label for="an">Show my name?</label><select id="an"><option value="false">Yes, show my name</option><option value="true">No, post anonymously</option></select></div></div>
        <p><button>Submit report</button></p><div id="out"></div></form>`;
    $('#f').onsubmit = async (e) => {
      e.preventDefault(); const btn = $('button', e.target); btn.disabled = true;
      try {
        const r = (await api('/reports', { method: 'POST', body: { scamType: $('#st').value, title: $('#ti').value, description: $('#de').value, identifier: { kind: $('#ik').value, value: $('#iv').value }, amountLost: Number($('#am').value) || 0, isAnonymous: $('#an').value === 'true' } })).data;
        $('#view #out').innerHTML = `<div class="card">Report submitted and waiting for review. ${r.similarReports ? `${r.similarReports} other report(s) already mention this identifier.` : 'You are the first to report this identifier.'}</div>`;
        e.target.reset();
      } catch (err) { $('#view #out').innerHTML = errBox(err); }
      btn.disabled = false;
    };
  },

  async mine() {
    if (!state.user) return needLogin('see your reports');
    $('#view').innerHTML = '<h1>My reports</h1><p class="sub">Reports you filed, in every status.</p><div id="list"></div>';
    const load = async () => {
      try { const r = await api('/reports/mine?limit=50'); $('#list').innerHTML = r.data.length ? r.data.map((x) => reportCard(x, 'mine')).join('') : '<p class="empty">You have not filed any reports yet.</p>'; }
      catch (e) { $('#list').innerHTML = errBox(e); }
    };
    $('#view').onclick = async (e) => {
      const b = e.target.closest('[data-del]'); if (!b || !confirm('Delete this report?')) return;
      try { await api(`/reports/${b.dataset.del}`, { method: 'DELETE' }); toast('Report deleted'); load(); } catch (err) { toast(err.message); }
    };
    load();
  },

  async queue() {
    if (!isStaff()) return needLogin('review reports', true);
    $('#view').innerHTML = '<h1>Moderation queue</h1><p class="sub">Pending reports, oldest first.</p><div id="list"></div>';
    const load = async () => {
      try { const r = await api('/moderation/queue?limit=20'); $('#list').innerHTML = r.data.length ? r.data.map((x) => reportCard(x, 'queue')).join('') : '<p class="empty">The queue is empty. Nothing needs review.</p>'; }
      catch (e) { $('#list').innerHTML = errBox(e); }
    };
    $('#view').onclick = async (e) => {
      const b = e.target.closest('[data-rev]'); if (!b) return;
      const [id, status] = b.dataset.rev.split('|'); const note = $(`#n-${id}`).value.trim();
      try { await api(`/moderation/reports/${id}`, { method: 'PATCH', body: { status, ...(note && { note }) } }); toast(`Report ${status}`); load(); }
      catch (err) { toast(err.message); }
    };
    load();
  },

  async stats() {
    $('#view').innerHTML = '<h1>Statistics</h1><p class="sub">Computed from verified reports.</p><div id="s"><p class="empty">Loading…</p></div>';
    try {
      const d = (await api('/stats/overview?months=6', { auth: false })).data; const max = (rows, k) => Math.max(1, ...rows.map((r) => r[k]));
      const bars = (rows, label, k) => rows.map((r) => `<div class="hbar"><span>${esc(pretty(r[label]))}</span><div class="track"><i style="width:${(r[k] / max(rows, k)) * 100}%"></i></div><b>${r[k]}</b></div>`).join('') || '<p class="empty">No data yet.</p>';
      $('#s').innerHTML = `<div class="stats"><div class="card"><b>${d.totals.verifiedReports}</b>verified reports</div><div class="card"><b>${money(d.totals.totalAmountLost)}</b>reported lost</div><div class="card"><b>${money(d.totals.averageAmountLost)}</b>average per report</div></div>
        <h2>Reports by scam type</h2><div class="card">${bars(d.byScamType, 'scamType', 'reports')}</div>
        <h2>Reports per month</h2><div class="card">${bars(d.monthlyTrend, 'month', 'reports')}</div>
        <h2>Most reported identifiers</h2><div class="card"><table><tr><th>Identifier</th><th>Kind</th><th>Reports</th><th>Lost</th></tr>${d.topIdentifiers.map((t) => `<tr><td>${esc(t.value)}</td><td>${esc(pretty(t.kind))}</td><td>${t.reports}</td><td>${money(t.totalLoss)}</td></tr>`).join('')}</table></div>`;
    } catch (e) { $('#s').innerHTML = errBox(e); }
  },

  login() {
    let mode = 'login';
    const draw = () => {
      $('#view').innerHTML = `<h1>${mode === 'login' ? 'Log in' : 'Create an account'}</h1><p class="sub">${mode === 'login' ? 'Log in to report scams, upvote and track your reports.' : 'It takes a few seconds.'}</p>
        <form class="card" id="f">${mode === 'register' ? '<label for="n">Name</label><input id="n" required minlength="2">' : ''}
        <label for="e">Email</label><input id="e" type="email" required><label for="p">Password</label><input id="p" type="password" required ${mode === 'register' ? 'minlength="8" placeholder="8+ characters with a letter and a digit"' : ''}>
        <p class="row"><button class="fit">${mode === 'login' ? 'Log in' : 'Create account'}</button><button type="button" class="ghost fit" id="sw">${mode === 'login' ? 'New here? Sign up' : 'Have an account? Log in'}</button></p><div id="out"></div></form>
        ${location.hostname === 'localhost' && mode === 'login' ? `<div class="chips">Demo accounts:${DEMO.map(([n, e]) => `<button type="button" class="sm" data-demo="${e}">${n}</button>`).join('')}</div>` : ''}`;
      $('#sw').onclick = () => { mode = mode === 'login' ? 'register' : 'login'; draw(); };
      $('#view').onclick = (e) => { const b = e.target.closest('[data-demo]'); if (b) { $('#e').value = b.dataset.demo; $('#p').value = 'ChangeMe123'; } };
      $('#f').onsubmit = async (e) => {
        e.preventDefault();
        try {
          const r = (await api(`/auth/${mode}`, { method: 'POST', auth: false, body: { ...(mode === 'register' && { name: $('#n').value }), email: $('#e').value, password: $('#p').value } })).data;
          setSession(r, r.user); chrome(); toast(`Welcome, ${r.user.name}`); location.hash = isStaff() ? '#/queue' : '#/report';
        } catch (err) { $('#view #out').innerHTML = errBox(err); }
      };
    };
    draw();
  },
};

/* ---------- pieces ---------- */
function verdict(r) {
  const s = r.summary;
  const title = { low: 'Low risk', medium: 'Medium risk', high: 'High risk', critical: 'Critical risk' }[r.riskLevel];
  return `<section class="verdict ${r.riskLevel}"><div class="vtop"><div class="ring" style="--p:${r.riskScore}"><b>${r.riskScore}</b></div>
    <div><h2>${title}</h2><p>${esc(r.recommendation)}</p><p><small>Confidence: ${esc(r.confidence)}. Checked: ${esc(r.identifier.normalized)}</small></p></div></div>
    <div class="panel">${s.totalReports} report(s), ${s.verifiedReports} verified, ${money(s.totalAmountLost)} reported lost${s.lastReportedAt ? `, last on ${date(s.lastReportedAt)}` : ''}.${s.topScamTypes.length ? ` Most common: ${esc(pretty(s.topScamTypes[0].scamType))}.` : ''}</div>
    <div class="panel"><strong>How the score was reached</strong>${Object.entries(r.breakdown).map(([k, b]) => `<div class="bar"><span>${PARTS[k]}</span><div class="track"><i style="width:${(b.score / b.max) * 100}%"></i></div><span>${b.score}/${b.max}</span></div>`).join('')}</div>
    <div class="panel"><strong>What we found</strong><ul>${r.signals.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></section>`;
}

function reportCard(x, mode) {
  const mod = x.moderation?.note ? `<p><em>Moderator note: ${esc(x.moderation.note)}</em></p>` : '';
  const acts = {
    feed: `<button class="sm" data-up="${x.id}">Upvote (${x.upvoteCount})</button><button class="ghost sm" data-check="${x.identifier.kind}|${esc(x.identifier.value)}">Check this ${esc(KINDS[x.identifier.kind].toLowerCase())}</button>`,
    mine: x.status === 'verified' ? '' : `<button class="danger sm" data-del="${x.id}">Delete</button>`,
    queue: `<input id="n-${x.id}" placeholder="Note (required to reject)" style="max-width:260px"><button class="ok sm" data-rev="${x.id}|verified">Verify</button><button class="danger sm" data-rev="${x.id}|rejected">Reject</button>`,
  }[mode];
  return `<article class="card item"><h3>${esc(x.title)}</h3><div class="meta"><span class="badge ${x.status}">${x.status}</span><span>${esc(pretty(x.scamType))}</span><span>${esc(x.identifier.value)}</span><span>${money(x.amountLost)}</span><span>${date(x.createdAt)}</span><span>${x.reporter ? `by ${esc(x.reporter.name)}` : 'anonymous'}</span></div><p>${esc(x.description)}</p>${mod}<div class="acts">${acts}</div></article>`;
}

function needLogin(what, staff) {
  $('#view').innerHTML = `<div class="card empty">${staff ? 'This page is for moderators and admins.' : `Log in to ${what}.`}<p><a href="#/login"><button>Go to log in</button></a></p></div>`;
}

function chrome() {
  const tabs = [['check', 'Check risk'], ['feed', 'Reports'], ['report', 'Report a scam'], ...(state.user ? [['mine', 'My reports']] : []), ...(isStaff() ? [['queue', 'Moderation']] : []), ['stats', 'Statistics']];
  const cur = location.hash.slice(2).split('?')[0] || 'check';
  $('#nav').innerHTML = tabs.map(([id, label]) => `<a href="#/${id}" class="${id === cur ? 'on' : ''}">${label}</a>`).join('');
  $('#who').innerHTML = state.user ? `<span>${esc(state.user.name)} (${esc(state.user.role)})</span><button class="ghost sm" id="logout">Log out</button>` : '<a href="#/login"><button class="ghost sm">Log in</button></a>';
  const out = $('#logout');
  if (out) out.onclick = async () => { if (state.refresh) await api('/auth/logout', { method: 'POST', auth: false, body: { refreshToken: state.refresh } }).catch(() => {}); setSession(null); chrome(); location.hash = '#/check'; route(); };
}

function route() {
  const name = location.hash.slice(2).split('?')[0] || 'check';
  $('#view').onclick = null;
  chrome();
  (views[name] || views.check)();
}

window.addEventListener('hashchange', route);
route();
