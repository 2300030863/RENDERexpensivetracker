-- Add Farmer occupation and category templates
USE expense_tracker;

-- Insert Farmer occupation
INSERT INTO occupations (name, occupation_type, description, created_at, updated_at)
VALUES ('Farmer', 'FARMER', 'For farmers and agricultural workers', NOW(), NOW());

-- Get the ID of the newly inserted occupation
SET @farmer_id = LAST_INSERT_ID();

-- Insert category templates for Farmer
INSERT INTO occupation_category_templates (occupation_id, category_name, description, color, display_order, created_at, updated_at)
VALUES
(@farmer_id, 'Seeds & Fertilizers', 'Seeds, fertilizers, and pesticides', '#8BC34A', 1, NOW(), NOW()),
(@farmer_id, 'Equipment & Machinery', 'Farm equipment and machinery', '#FF9800', 2, NOW(), NOW()),
(@farmer_id, 'Livestock', 'Animal feed and veterinary', '#795548', 3, NOW(), NOW()),
(@farmer_id, 'Irrigation & Water', 'Water supply and irrigation costs', '#2196F3', 4, NOW(), NOW()),
(@farmer_id, 'Fuel & Energy', 'Diesel, electricity, and energy', '#FF5722', 5, NOW(), NOW()),
(@farmer_id, 'Labor', 'Hired labor and wages', '#9C27B0', 6, NOW(), NOW()),
(@farmer_id, 'Land Lease', 'Land rental and property tax', '#607D8B', 7, NOW(), NOW()),
(@farmer_id, 'Transportation', 'Transport and logistics', '#4CAF50', 8, NOW(), NOW()),
(@farmer_id, 'Storage & Packaging', 'Storage and packaging materials', '#FFC107', 9, NOW(), NOW()),
(@farmer_id, 'Personal Expenses', 'Household and personal needs', '#E91E63', 10, NOW(), NOW());

SELECT 'Farmer occupation added successfully!' as message;
SELECT COUNT(*) as total_occupations FROM occupations;
