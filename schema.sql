CREATE TABLE IF NOT EXISTS device_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT,
  auth TEXT,
  subscription_json TEXT NOT NULL,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, device_id)
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  name TEXT,
  persona_prompt TEXT,
  active_reply_enabled INTEGER NOT NULL DEFAULT 0,
  active_reply_interval_sec INTEGER NOT NULL DEFAULT 60,
  active_reply_start_time INTEGER DEFAULT 0,
  last_triggered_msg_id TEXT,
  last_triggered_at INTEGER DEFAULT 0,
  last_seen_message_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, contact_id)
);

CREATE TABLE IF NOT EXISTS message_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  message_id TEXT,
  role TEXT,
  content TEXT,
  type TEXT,
  time INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, contact_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  description TEXT,
  time INTEGER NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'offline-backend'
);

CREATE INDEX IF NOT EXISTS idx_messages_user_time ON messages(user_id, time);

