const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'submissions.json');

// Ensure data directory and file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
}

function readDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (_) {
    return [];
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('❌ Database write error:', err.message);
  }
}

// Auto-purge records older than 30 days
function purgeOldRecords() {
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const db = readDb();
  const filtered = db.filter(item => {
    const itemTime = new Date(item.timestamp).getTime();
    return now - itemTime < thirtyDaysMs;
  });
  if (filtered.length !== db.length) {
    console.log(`🧹 Purged ${db.length - filtered.length} records older than 30 days.`);
    writeDb(filtered);
  }
}

// Initial purge on load
purgeOldRecords();

const database = {
  getAll() {
    purgeOldRecords();
    return readDb().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  getById(id) {
    const db = readDb();
    return db.find(item => item.id === id);
  },

  create({ chatId, userName, state, appNo, dob, password }) {
    const db = readDb();
    const newRecord = {
      id: 'SUB_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      chatId: String(chatId),
      userName: userName || 'Customer',
      state: state || 'Unknown',
      appNo: appNo || '',
      dob: dob || '',
      password: password || '',
      status: 'PENDING_CAPTCHA', // Initial status when user enters DOB
      photoPath: null,
      photoBase64: null,
      rtoName: null,
      rtoCode: null,
      applicantName: null,
      fatherName: null,
      licenceNo: null,
      errorMessage: null,
      timestamp: new Date().toISOString()
    };
    db.push(newRecord);
    writeDb(db);
    return newRecord;
  },

  update(id, updates) {
    const db = readDb();
    const index = db.findIndex(item => item.id === id);
    if (index !== -1) {
      db[index] = { ...db[index], ...updates, updatedAt: new Date().toISOString() };
      writeDb(db);
      return db[index];
    }
    return null;
  },

  delete(id) {
    const db = readDb();
    const filtered = db.filter(item => item.id !== id);
    const deleted = filtered.length !== db.length;
    if (deleted) writeDb(filtered);
    return deleted;
  }
};

module.exports = database;
