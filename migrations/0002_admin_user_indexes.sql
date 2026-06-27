CREATE INDEX IF NOT EXISTS idx_moq_users_created_at_id_desc
  ON moq_users(created_at DESC, id DESC);
