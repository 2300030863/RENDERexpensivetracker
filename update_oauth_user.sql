-- Run this in MySQL Workbench to mark your user as OAuth user
USE expense_tracker;

-- Update your user to be marked as OAuth user
UPDATE users 
SET is_oauth_user = TRUE 
WHERE email = 'anjalikommalapati99@gmail.com';

-- Verify the update
SELECT id, username, email, first_name, last_name, is_oauth_user 
FROM users 
WHERE email = 'anjalikommalapati99@gmail.com';
