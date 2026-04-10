CREATE TABLE IF NOT EXISTS moq_users (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  primary_email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

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
