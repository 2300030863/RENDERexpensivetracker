-- Check current user's OAuth status and update if needed
USE expense_tracker;

-- View all users and their OAuth status
SELECT id, username, email, first_name, last_name, is_oauth_user 
FROM users;

-- Mark anjalikommalapati99@gmail.com as OAuth user
UPDATE users SET is_oauth_user = TRUE WHERE email = 'anjalikommalapati99@gmail.com';

-- Verify the update
SELECT id, username, email, first_name, last_name, is_oauth_user 
FROM users 
WHERE email = 'anjalikommalapati99@gmail.com';
