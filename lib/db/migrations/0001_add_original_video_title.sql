BEGIN;

ALTER TABLE scheduled_videos
  ADD COLUMN IF NOT EXISTS original_title TEXT,
  ADD COLUMN IF NOT EXISTS use_original_title BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS title_manually_edited BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS caption_manually_edited BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;

-- Existing rows retain their current title/description values. New metadata
-- fields default to NULL/FALSE and are populated only for new opted-in items.
