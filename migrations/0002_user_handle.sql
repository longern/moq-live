ALTER TABLE moq_users
  ADD COLUMN handle TEXT;

ALTER TABLE moq_users
  ADD COLUMN handle_changed_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_moq_users_handle
  ON moq_users(handle)
  WHERE handle IS NOT NULL AND handle <> '';

CREATE TABLE IF NOT EXISTS moq_rooms (
  id TEXT PRIMARY KEY,
  host_user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (host_user_id) REFERENCES moq_users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_moq_rooms_host_user_id
  ON moq_rooms(host_user_id);

INSERT INTO moq_rooms (
  id,
  host_user_id,
  title,
  cover_url,
  created_at,
  updated_at
)
SELECT
  lower(hex(randomblob(16))),
  users.id,
  '',
  '',
  users.created_at,
  users.updated_at
FROM moq_users AS users
LEFT JOIN moq_rooms AS rooms
  ON rooms.host_user_id = users.id
WHERE rooms.host_user_id IS NULL;
