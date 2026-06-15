CREATE TABLE IF NOT EXISTS moq_users (
  id TEXT PRIMARY KEY,
  handle TEXT,
  handle_changed_at TEXT,
  display_name TEXT,
  display_name_changed_at TEXT,
  avatar_url TEXT,
  primary_email TEXT,
  gender TEXT,
  birth_date TEXT,
  bio TEXT,
  last_location_province TEXT,
  last_location_updated_at TEXT,
  follower_count INTEGER NOT NULL DEFAULT 0,
  following_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_moq_users_handle
  ON moq_users(handle)
  WHERE handle IS NOT NULL AND handle <> '';

CREATE TABLE IF NOT EXISTS moq_user_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  tenant_id TEXT,
  provider_oid TEXT,
  email TEXT,
  raw_profile_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES moq_users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_moq_user_identities_provider_subject
  ON moq_user_identities(provider, provider_subject);

CREATE TABLE IF NOT EXISTS moq_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  ip TEXT,
  user_agent TEXT,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES moq_users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_moq_sessions_token_hash
  ON moq_sessions(session_token_hash);

CREATE INDEX IF NOT EXISTS idx_moq_sessions_user_id
  ON moq_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_moq_sessions_expires_at
  ON moq_sessions(expires_at);

CREATE TABLE IF NOT EXISTS moq_rooms (
  id TEXT PRIMARY KEY,
  host_user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  welcome_message TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  live_notification_sent_at TEXT,
  last_started_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (host_user_id) REFERENCES moq_users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_moq_rooms_host_user_id
  ON moq_rooms(host_user_id);

CREATE INDEX IF NOT EXISTS idx_moq_rooms_last_started_at
  ON moq_rooms(last_started_at DESC);

CREATE TABLE IF NOT EXISTS moq_user_follows (
  follower_user_id TEXT NOT NULL,
  followed_user_id TEXT NOT NULL,
  notify_live_started INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (follower_user_id, followed_user_id),
  CHECK (follower_user_id <> followed_user_id),
  FOREIGN KEY (follower_user_id) REFERENCES moq_users(id),
  FOREIGN KEY (followed_user_id) REFERENCES moq_users(id)
);

CREATE INDEX IF NOT EXISTS idx_moq_user_follows_followed
  ON moq_user_follows(followed_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moq_user_follows_follower
  ON moq_user_follows(follower_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS moq_push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES moq_users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_moq_push_subscriptions_endpoint
  ON moq_push_subscriptions(endpoint);

CREATE INDEX IF NOT EXISTS idx_moq_push_subscriptions_user
  ON moq_push_subscriptions(user_id, revoked_at);
