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

ALTER TABLE moq_rooms
  ADD COLUMN welcome_message TEXT NOT NULL DEFAULT '';
