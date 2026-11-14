-- Migration script to add is_oauth_user column to users table
-- This column tracks whether a user registered via OAuth (Google) or standard registration

USE expense_tracker;

-- Add is_oauth_user column if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_oauth_user BOOLEAN DEFAULT FALSE;

-- Update existing users to ensure they have a value (default to false for regular users)
UPDATE users 
SET is_oauth_user = FALSE 
WHERE is_oauth_user IS NULL;

-- Mark users with randomly generated passwords as potential OAuth users
-- (This is a best-effort approach; adjust based on your data)
-- Users with very long random passwords are likely OAuth users
-- Comment this out if you want to manually identify OAuth users
-- UPDATE users 
-- SET is_oauth_user = TRUE 
-- WHERE LENGTH(password) > 100;

SELECT 'Migration completed: is_oauth_user column added' AS status;
