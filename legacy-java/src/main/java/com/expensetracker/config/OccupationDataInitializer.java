package com.expensetracker.config;

import com.expensetracker.entity.*;
import com.expensetracker.repository.OccupationCategoryTemplateRepository;
import com.expensetracker.repository.OccupationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Initializes occupation data and category templates
 */
@Configuration
public class OccupationDataInitializer {
    
    @Autowired
    private OccupationRepository occupationRepository;
    
    @Autowired
    private OccupationCategoryTemplateRepository templateRepository;
    
    @Bean
    public CommandLineRunner initOccupationData() {
        return args -> {
            try {
                long count = occupationRepository.count();
                System.out.println("📊 Current occupation count: " + count);
                
                // Check if Farmer occupation exists
                boolean farmerExists = occupationRepository.findAll().stream()
                    .anyMatch(o -> o.getOccupationType() == OccupationType.FARMER);
                
                if (!farmerExists) {
                    System.out.println("🚜 Farmer occupation not found. Adding it now...");
                    Occupation farmer = new Occupation("Farmer", 
                            OccupationType.FARMER, 
                            "For farmers and agricultural workers");
                    farmer = occupationRepository.save(farmer);
                    createFarmerCategories(farmer);
                    System.out.println("✅ Farmer occupation added successfully!");
                }
                
                // Only initialize all if no occupations exist
                if (count == 0) {
                    System.out.println("🎯 Initializing occupation data...");
                    initializeOccupations();
                    System.out.println("✅ Occupation data initialized successfully! Final count: " + occupationRepository.count());
                } else {
                    System.out.println("ℹ️ Occupations already exist. Skipping full initialization. Total count: " + occupationRepository.count());
                }
            } catch (Exception e) {
                System.err.println("⚠️ Failed to initialize occupation data: " + e.getMessage());
                e.printStackTrace();
                System.err.println("Please run the database migration script: backend/database_migration_occupation.sql");
                // Don't fail the application startup
            }
        };
    }
    
    private void initializeOccupations() {
        // 1. Student
        Occupation student = new Occupation("Student", OccupationType.STUDENT, 
                "For students in school, college, or university");
        student = occupationRepository.save(student);
        createStudentCategories(student);
        
        // 2. Software Engineer / IT Professional
        Occupation softwareEngineer = new Occupation("Software Engineer / IT Professional", 
                OccupationType.SOFTWARE_ENGINEER, 
                "For software developers, IT professionals, and tech workers");
        softwareEngineer = occupationRepository.save(softwareEngineer);
        createSoftwareEngineerCategories(softwareEngineer);
        
        // 3. Business Owner / UMKM
        Occupation businessOwner = new Occupation("Business Owner / UMKM", 
                OccupationType.BUSINESS_OWNER, 
                "For small business owners, retail shop owners, and UMKM");
        businessOwner = occupationRepository.save(businessOwner);
        createBusinessOwnerCategories(businessOwner);
        
        // 4. Delivery Driver / Ojek Partner
        Occupation deliveryDriver = new Occupation("Delivery Driver / Ojek Partner", 
                OccupationType.DELIVERY_DRIVER, 
                "For taxi drivers, delivery riders, and transport partners");
        deliveryDriver = occupationRepository.save(deliveryDriver);
        createDeliveryDriverCategories(deliveryDriver);
        
        // 5. Freelancer / Creator
        Occupation freelancer = new Occupation("Freelancer / Creator", 
                OccupationType.FREELANCER, 
                "For freelancers, content creators, and independent contractors");
        freelancer = occupationRepository.save(freelancer);
        createFreelancerCategories(freelancer);
        
        // 6. Homemaker
        Occupation homemaker = new Occupation("Homemaker", 
                OccupationType.HOMEMAKER, 
                "For people managing household expenses");
        homemaker = occupationRepository.save(homemaker);
        createHomemakerCategories(homemaker);
        
        // 7. Salaried Employee
        Occupation salariedEmployee = new Occupation("Salaried Employee", 
                OccupationType.SALARIED_EMPLOYEE, 
                "For salaried professionals in private sector");
        salariedEmployee = occupationRepository.save(salariedEmployee);
        createSalariedEmployeeCategories(salariedEmployee);
        
        // 8. Farmer
        Occupation farmer = new Occupation("Farmer", 
                OccupationType.FARMER, 
                "For farmers and agricultural workers");
        farmer = occupationRepository.save(farmer);
        createFarmerCategories(farmer);
        
        // 9. Other
        Occupation other = new Occupation("Other", 
                OccupationType.OTHER, 
                "General expense categories for any occupation");
        other = occupationRepository.save(other);
        createOtherCategories(other);
    }
    
    private void createStudentCategories(Occupation occupation) {
        createTemplate(occupation, "Tuition & Fees", "College/school fees, exam fees", "#FF5722", 1);
        createTemplate(occupation, "Books & Stationery", "Textbooks, notebooks, supplies", "#2196F3", 2);
        createTemplate(occupation, "Hostel / Rent", "Accommodation expenses", "#9C27B0", 3);
        createTemplate(occupation, "Food", "Canteen, mess, or outside food", "#FF9800", 4);
        createTemplate(occupation, "Transport", "Bus, train, or local travel", "#4CAF50", 5);
        createTemplate(occupation, "Internet & Mobile", "Data plans and recharges", "#00BCD4", 6);
        createTemplate(occupation, "Entertainment", "Movies, games, outings", "#E91E63", 7);
        createTemplate(occupation, "Miscellaneous", "Other student expenses", "#607D8B", 8);
    }
    
    private void createSoftwareEngineerCategories(Occupation occupation) {
        createTemplate(occupation, "Rent / PG", "Housing or accommodation", "#9C27B0", 1);
        createTemplate(occupation, "Food & Groceries", "Daily meals and grocery shopping", "#FF9800", 2);
        createTemplate(occupation, "Internet", "Broadband and WiFi", "#00BCD4", 3);
        createTemplate(occupation, "Mobile", "Phone bills and recharges", "#2196F3", 4);
        createTemplate(occupation, "Subscriptions", "Cloud services, tools, SaaS", "#FF5722", 5);
        createTemplate(occupation, "Transport", "Commute and travel", "#4CAF50", 6);
        createTemplate(occupation, "Skill Development", "Courses, certifications, books", "#673AB7", 7);
        createTemplate(occupation, "Gadgets & Tech", "Laptops, accessories, upgrades", "#009688", 8);
        createTemplate(occupation, "Health & Fitness", "Gym, healthcare", "#E91E63", 9);
    }
    
    private void createBusinessOwnerCategories(Occupation occupation) {
        createTemplate(occupation, "Inventory / Stock", "Product purchases and supplies", "#FF5722", 1);
        createTemplate(occupation, "Shop Rent", "Store or office rent", "#9C27B0", 2);
        createTemplate(occupation, "Utilities", "Electricity, water, gas", "#FFC107", 3);
        createTemplate(occupation, "Employee Salary", "Staff wages and payments", "#4CAF50", 4);
        createTemplate(occupation, "Transport & Delivery", "Shipping and logistics", "#2196F3", 5);
        createTemplate(occupation, "Marketing", "Ads, promotions, social media", "#E91E63", 6);
        createTemplate(occupation, "Equipment", "Tools, machinery, furniture", "#607D8B", 7);
        createTemplate(occupation, "Licenses & Permits", "Government fees and compliance", "#795548", 8);
        createTemplate(occupation, "Miscellaneous Business", "Other business costs", "#9E9E9E", 9);
    }
    
    private void createDeliveryDriverCategories(Occupation occupation) {
        createTemplate(occupation, "Fuel", "Petrol, diesel, CNG", "#FF5722", 1);
        createTemplate(occupation, "Vehicle Maintenance", "Repairs, servicing, parts", "#607D8B", 2);
        createTemplate(occupation, "Mobile Data", "Internet and call recharges", "#00BCD4", 3);
        createTemplate(occupation, "Food", "Meals during work", "#FF9800", 4);
        createTemplate(occupation, "Parking & Toll", "Parking fees and tolls", "#4CAF50", 5);
        createTemplate(occupation, "EMI / Bike Rent", "Vehicle loan or rental", "#9C27B0", 6);
        createTemplate(occupation, "Insurance", "Vehicle insurance", "#2196F3", 7);
        createTemplate(occupation, "Miscellaneous", "Other work-related expenses", "#9E9E9E", 8);
    }
    
    private void createFreelancerCategories(Occupation occupation) {
        createTemplate(occupation, "Software & Tools", "Subscriptions and software licenses", "#FF5722", 1);
        createTemplate(occupation, "Internet", "WiFi and connectivity", "#00BCD4", 2);
        createTemplate(occupation, "Marketing", "Ads, portfolio, branding", "#E91E63", 3);
        createTemplate(occupation, "Equipment", "Camera, laptop, accessories", "#607D8B", 4);
        createTemplate(occupation, "Workspace", "Co-working space or rent", "#9C27B0", 5);
        createTemplate(occupation, "Travel", "Client meetings, events", "#4CAF50", 6);
        createTemplate(occupation, "Taxes & Savings", "Income tax, investments", "#FFC107", 7);
        createTemplate(occupation, "Professional Development", "Courses, networking", "#673AB7", 8);
    }
    
    private void createHomemakerCategories(Occupation occupation) {
        createTemplate(occupation, "Groceries", "Daily household supplies", "#4CAF50", 1);
        createTemplate(occupation, "Utilities", "Electricity, water, gas bills", "#FFC107", 2);
        createTemplate(occupation, "Children's Education", "School fees, supplies", "#2196F3", 3);
        createTemplate(occupation, "Healthcare", "Medical expenses, medicines", "#E91E63", 4);
        createTemplate(occupation, "House Rent / EMI", "Housing expenses", "#9C27B0", 5);
        createTemplate(occupation, "Transport", "Travel and commute", "#00BCD4", 6);
        createTemplate(occupation, "Entertainment", "Family outings, subscriptions", "#FF9800", 7);
        createTemplate(occupation, "Household Items", "Furniture, appliances, repairs", "#607D8B", 8);
    }
    
    private void createSalariedEmployeeCategories(Occupation occupation) {
        createTemplate(occupation, "Rent / EMI", "Housing expenses", "#9C27B0", 1);
        createTemplate(occupation, "Food & Groceries", "Meals and grocery", "#FF9800", 2);
        createTemplate(occupation, "Transport", "Commute expenses", "#4CAF50", 3);
        createTemplate(occupation, "Utilities", "Bills and services", "#FFC107", 4);
        createTemplate(occupation, "Healthcare", "Medical and insurance", "#E91E63", 5);
        createTemplate(occupation, "Entertainment", "Movies, dining, hobbies", "#673AB7", 6);
        createTemplate(occupation, "Savings & Investments", "SIP, FD, stocks", "#2196F3", 7);
        createTemplate(occupation, "Personal Care", "Grooming and wellness", "#00BCD4", 8);
    }
    
    private void createFarmerCategories(Occupation occupation) {
        createTemplate(occupation, "Seeds & Fertilizers", "Seeds, fertilizers, and pesticides", "#8BC34A", 1);
        createTemplate(occupation, "Equipment & Machinery", "Farm equipment and machinery", "#FF9800", 2);
        createTemplate(occupation, "Livestock", "Animal feed and veterinary", "#795548", 3);
        createTemplate(occupation, "Irrigation & Water", "Water supply and irrigation costs", "#2196F3", 4);
        createTemplate(occupation, "Fuel & Energy", "Diesel, electricity, and energy", "#FF5722", 5);
        createTemplate(occupation, "Labor", "Hired labor and wages", "#9C27B0", 6);
        createTemplate(occupation, "Land Lease", "Land rental and property tax", "#607D8B", 7);
        createTemplate(occupation, "Transportation", "Transport and logistics", "#4CAF50", 8);
        createTemplate(occupation, "Storage & Packaging", "Storage and packaging materials", "#FFC107", 9);
        createTemplate(occupation, "Personal Expenses", "Household and personal needs", "#E91E63", 10);
    }
    
    private void createOtherCategories(Occupation occupation) {
        createTemplate(occupation, "Food", "Meals and dining", "#FF9800", 1);
        createTemplate(occupation, "Transport", "Travel expenses", "#4CAF50", 2);
        createTemplate(occupation, "Bills", "Utilities and services", "#FFC107", 3);
        createTemplate(occupation, "Shopping", "Clothing and personal items", "#E91E63", 4);
        createTemplate(occupation, "Entertainment", "Leisure activities", "#673AB7", 5);
        createTemplate(occupation, "Healthcare", "Medical expenses", "#2196F3", 6);
        createTemplate(occupation, "Miscellaneous", "Other expenses", "#9E9E9E", 7);
    }
    
    private void createTemplate(Occupation occupation, String name, String description, 
                                 String color, int order) {
        OccupationCategoryTemplate template = new OccupationCategoryTemplate(
                occupation, name, description, color, order
        );
        templateRepository.save(template);
    }
}
