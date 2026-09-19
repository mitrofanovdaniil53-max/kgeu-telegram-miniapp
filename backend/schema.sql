CREATE TABLE IF NOT EXISTS student_services (
  telegram_user_id TEXT PRIMARY KEY,
  service_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  device_id TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_student_services_updated_at
  ON student_services(updated_at);
