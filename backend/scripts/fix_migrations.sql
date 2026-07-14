-- Fix alembic_version table for v3 migrations
-- Run this before running the migration script

-- The alembic_version table has version_num as VARCHAR(32)
-- Our migration names were too long, so we shortened them:
-- - 016_user_study_data_and_reader_mode -> 016_study_reader_mode
-- - 017_content_body_sentinels_version -> 017_body_sentinels

-- This script is safe to run multiple times (idempotent)

-- Verify current state
SELECT version_num FROM alembic_version;

-- If stuck at 015, no action needed - just run alembic upgrade head
-- If stuck at 016 with old name, update it:
-- UPDATE alembic_version SET version_num = '016_study_reader_mode' 
--   WHERE version_num = '016_user_study_data_and_reader_mode';

-- If stuck at 017 with old name, update it:
-- UPDATE alembic_version SET version_num = '017_body_sentinels'
--   WHERE version_num = '017_content_body_sentinels_version';
