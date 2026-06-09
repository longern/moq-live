ALTER TABLE moq_users
  ADD COLUMN follower_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE moq_users
  ADD COLUMN following_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_moq_user_follows_follower
  ON moq_user_follows(follower_user_id, created_at DESC);

UPDATE moq_users
SET follower_count = (
  SELECT COUNT(*)
  FROM moq_user_follows
  WHERE moq_user_follows.followed_user_id = moq_users.id
);

UPDATE moq_users
SET following_count = (
  SELECT COUNT(*)
  FROM moq_user_follows
  WHERE moq_user_follows.follower_user_id = moq_users.id
);
