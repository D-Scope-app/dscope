ALTER TABLE survey_jobs ADD COLUMN payload_json TEXT;

CREATE INDEX IF NOT EXISTS idx_survey_jobs_survey_id_job_type
ON survey_jobs(survey_id, job_type);

CREATE INDEX IF NOT EXISTS idx_survey_jobs_created_at
ON survey_jobs(created_at);