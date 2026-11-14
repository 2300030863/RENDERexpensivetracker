-- ================================================================
-- OCCUPATION-BASED EXPENSE TRACKER DATABASE MIGRATION
-- This script adds occupation functionality to the Expense Tracker
-- ================================================================

-- Step 1: Create Occupations Table
CREATE TABLE IF NOT EXISTS occupations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    occupation_type VARCHAR(50) NOT NULL,
    description VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_occupation_type (occupation_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Step 2: Create Occupation Category Templates Table
CREATE TABLE IF NOT EXISTS occupation_category_templates (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    occupation_id BIGINT NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    color VARCHAR(7),
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (occupation_id) REFERENCES occupations(id) ON DELETE CASCADE,
    INDEX idx_template_occupation (occupation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Step 3: Add occupation_id column to users table (if not exists)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS occupation_id BIGINT,
ADD INDEX IF NOT EXISTS idx_user_occupation (occupation_id),
ADD CONSTRAINT fk_user_occupation 
    FOREIGN KEY (occupation_id) REFERENCES occupations(id) ON DELETE SET NULL;

-- Step 4: Add is_occupation_generated column to categories table (if not exists)
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS is_occupation_generated BOOLEAN DEFAULT FALSE;

-- ================================================================
-- DATA SEEDING (Optional - Will be done by OccupationDataInitializer.java)
-- Below SQL is for reference or manual execution if needed
-- ================================================================

-- Insert Occupations (uncomment if not using Java initializer)
/*
INSERT INTO occupations (name, occupation_type, description) VALUES
('Student', 'STUDENT', 'For students in school, college, or university'),
('Software Engineer / IT Professional', 'SOFTWARE_ENGINEER', 'For software developers, IT professionals, and tech workers'),
('Business Owner / UMKM', 'BUSINESS_OWNER', 'For small business owners, retail shop owners, and UMKM'),
('Delivery Driver / Ojek Partner', 'DELIVERY_DRIVER', 'For taxi drivers, delivery riders, and transport partners'),
('Freelancer / Creator', 'FREELANCER', 'For freelancers, content creators, and independent contractors'),
('Homemaker', 'HOMEMAKER', 'For people managing household expenses'),
('Salaried Employee', 'SALARIED_EMPLOYEE', 'For salaried professionals in private sector'),
('Other', 'OTHER', 'General expense categories for any occupation');
*/

-- ================================================================
-- VERIFICATION QUERIES
-- Run these after migration to verify success
-- ================================================================

-- Check if tables were created
SELECT 'Occupations table exists' AS status, COUNT(*) AS count FROM occupations;
SELECT 'Templates table exists' AS status, COUNT(*) AS count FROM occupation_category_templates;

-- Check if columns were added
DESCRIBE users;
DESCRIBE categories;

-- View occupation data
SELECT * FROM occupations ORDER BY name;

-- ================================================================
-- ROLLBACK SCRIPT (Use with caution!)
-- ================================================================

/*
-- Remove foreign key constraint from users
ALTER TABLE users DROP FOREIGN KEY IF EXISTS fk_user_occupation;
ALTER TABLE users DROP INDEX IF EXISTS idx_user_occupation;
ALTER TABLE users DROP COLUMN IF EXISTS occupation_id;

-- Remove column from categories
ALTER TABLE categories DROP COLUMN IF EXISTS is_occupation_generated;

-- Drop tables
DROP TABLE IF EXISTS occupation_category_templates;
DROP TABLE IF EXISTS occupations;
*/
