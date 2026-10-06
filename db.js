import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || '/data';
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'previews'), { recursive: true });

const db = new Database(path.join(DATA_DIR, 'edo.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_keys (
  user_id               INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  public_key            TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  salt                  TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id      INTEGER NOT NULL REFERENCES users(id),
  title         TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name   TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  pages         INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'draft',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approvals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id   INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  approver_id   INTEGER NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'pending',
  comment       TEXT,
  cancel_reason TEXT,
  page          INTEGER NOT NULL DEFAULT 1,
  pos_x         REAL NOT NULL DEFAULT 0.5,
  pos_y         REAL NOT NULL DEFAULT 0.5,
  signature     TEXT,
  signed_at     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  message     TEXT NOT NULL,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS download_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  ip          TEXT,
  user_agent  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_approvals_doc ON approvals(document_id);
CREATE INDEX IF NOT EXISTS idx_approvals_user ON approvals(approver_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_download_log_doc ON download_log(document_id);

CREATE TABLE IF NOT EXISTS annotations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  page        INTEGER NOT NULL DEFAULT 1,
  pos_x       REAL NOT NULL DEFAULT 0.5,
  pos_y       REAL NOT NULL DEFAULT 0.5,
  text        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#f59e0b',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_annotations_doc ON annotations(document_id, page);

CREATE TABLE IF NOT EXISTS annotation_comments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  annotation_id INTEGER NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  text          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_annotation_comments_annot ON annotation_comments(annotation_id);



CREATE TABLE IF NOT EXISTS groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sequential  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_groups_owner ON groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);

`);

function ensureColumn(table, col, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.find(c => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    console.log(`[migration] added ${table}.${col}`);
  }
}

// Все миграции проекта:
ensureColumn('documents', 'sender_signature', 'TEXT');
ensureColumn('documents', 'sender_signed_at', 'TEXT');
ensureColumn('documents', 'sender_hash', 'TEXT');
ensureColumn('documents', 'sender_page', 'INTEGER');
ensureColumn('documents', 'sender_pos_x', 'REAL');
ensureColumn('documents', 'sender_pos_y', 'REAL');
ensureColumn('documents', 'sender_comment', 'TEXT');
ensureColumn('approvals', 'group_id', 'INTEGER');
ensureColumn('approvals', 'order_index', 'INTEGER');
ensureColumn('approvals', 'group_sequential', 'INTEGER');
ensureColumn('group_members', 'level_index', 'INTEGER DEFAULT 1');
ensureColumn('notifications', 'annotation_id', 'INTEGER');

export default db;
