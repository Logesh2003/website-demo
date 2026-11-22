import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { hashSecret } from './lib/security.js';
import { boothsFor } from './data/geo.js';

export function openDb(file = process.env.SETHU_DB || 'data/sethu.db') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mobile TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT, affiliation TEXT, party TEXT,
      election_type TEXT, position TEXT, local_body TEXT, ward_number TEXT,
      district TEXT, assembly_id INTEGER,
      booths TEXT NOT NULL DEFAULT '[]',
      passcode_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'registered',  -- registered | pending_review | active
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_demo INTEGER NOT NULL DEFAULT 0,
      lang TEXT DEFAULT 'en',
      consent_at TEXT, consent_ip TEXT,
      attribution TEXT,
      election_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS otps (
      mobile TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, sends INTEGER NOT NULL DEFAULT 0, window_start INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, mobile TEXT, meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      ref TEXT UNIQUE NOT NULL, booth_count INTEGER NOT NULL,
      base INTEGER NOT NULL, gst INTEGER NOT NULL, total INTEGER NOT NULL,
      utr TEXT, status TEXT NOT NULL DEFAULT 'created', -- created | submitted | approved | rejected
      note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), reviewed_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS payments_utr ON payments(utr) WHERE utr IS NOT NULL;
    CREATE TABLE IF NOT EXISTS voter_tags (
      user_id INTEGER NOT NULL REFERENCES users(id), voter_id TEXT NOT NULL,
      sentiment TEXT, note TEXT, contacted INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, voter_id)
    );
    CREATE TABLE IF NOT EXISTS volunteers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL, mobile TEXT NOT NULL, booths TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL, booth_no INTEGER, volunteer_id INTEGER,
      status TEXT NOT NULL DEFAULT 'todo', due TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS broadcasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
      channel TEXT NOT NULL, segment TEXT NOT NULL, message TEXT NOT NULL,
      audience INTEGER NOT NULL, cost REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_review', scheduled_for TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- Real voters loaded from electoral-roll imports or captured in the field.
    CREATE TABLE IF NOT EXISTS voters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assembly_id INTEGER NOT NULL, booth_no INTEGER NOT NULL, serial INTEGER NOT NULL,
      epic TEXT, name TEXT NOT NULL, name_ta TEXT, relation TEXT, relation_name TEXT,
      age INTEGER, gender TEXT, house TEXT, section INTEGER NOT NULL DEFAULT 1, mobile TEXT,
      source TEXT NOT NULL,             -- roll_import | field
      import_id INTEGER, captured_by TEXT, deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS voters_epic ON voters(assembly_id, epic) WHERE epic IS NOT NULL AND epic != '';
    CREATE UNIQUE INDEX IF NOT EXISTS voters_serial ON voters(assembly_id, booth_no, serial);
    CREATE INDEX IF NOT EXISTS voters_booth ON voters(assembly_id, booth_no);
    CREATE TABLE IF NOT EXISTS booth_meta (
      assembly_id INTEGER NOT NULL, booth_no INTEGER NOT NULL, name TEXT, address TEXT, lat REAL, lng REAL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (assembly_id, booth_no)
    );
    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
      assembly_id INTEGER NOT NULL, booth_no INTEGER NOT NULL, filename TEXT, pages INTEGER NOT NULL DEFAULT 0,
      engine TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', -- draft | committed | discarded
      header TEXT, rows TEXT NOT NULL DEFAULT '[]', committed_rows INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), committed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL, detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  seed(db);
  return db;
}

function seed(db) {
  const exists = db.prepare('SELECT 1 FROM users WHERE mobile = ?');
  const insert = db.prepare(`INSERT INTO users (mobile, full_name, role, affiliation, party, election_type, district, assembly_id,
    booths, passcode_hash, status, is_admin, is_demo, consent_at, election_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`);

  if (!exists.get('9000000000')) {
    // Demo candidate: Mylapore (id 9), 12 booths, active plan.
    const booths = boothsFor(9).slice(0, 12).map((b) => b.no);
    insert.run('9000000000', 'demo-candidate', 'confirmed', 'independent', null, 'assembly', 'Chennai', 9,
      JSON.stringify(booths), hashSecret('demo1234'), 'active', 0, 1, nextElectionDate());
    const uid = db.prepare('SELECT id FROM users WHERE mobile = ?').get('9000000000').id;
    const v = db.prepare('INSERT INTO volunteers (user_id, name, mobile, booths) VALUES (?, ?, ?, ?)');
    v.run(uid, 'Kathir (Booth agent)', '9876500001', JSON.stringify(booths.slice(0, 4)));
    v.run(uid, 'Revathi (Booth agent)', '9876500002', JSON.stringify(booths.slice(4, 8)));
    const t = db.prepare('INSERT INTO tasks (user_id, title, booth_no, volunteer_id, status) VALUES (?, ?, ?, ?, ?)');
    t.run(uid, 'Door-to-door: Section 1 first-time voters', booths[0], 1, 'doing');
    t.run(uid, 'Verify missing mobile numbers', booths[2], 1, 'todo');
    t.run(uid, 'Senior citizens: arrange polling-day transport list', booths[5], 2, 'todo');
    t.run(uid, 'Booth committee meeting', booths[6], 2, 'done');
  } else {
    db.prepare("UPDATE users SET full_name = 'demo-candidate' WHERE mobile = '9000000000' OR is_demo = 1").run();
  }
  if (!exists.get('9999999999')) {
    insert.run('9999999999', 'Voiz of Aram Admin', null, null, null, null, null, null, '[]',
      hashSecret(process.env.SETHU_ADMIN_PASSCODE || 'admin1234'), 'active', 1, 0, null);
  } else {
    db.prepare("UPDATE users SET full_name = 'Voiz of Aram Admin' WHERE mobile = '9999999999'").run();
  }
}

export function nextElectionDate() {
  // Configurable target used by the countdown. Defaults to ~5 months out.
  return process.env.SETHU_ELECTION_DATE || new Date(Date.now() + 150 * 864e5).toISOString().slice(0, 10);
}
