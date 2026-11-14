package com.expensetracker.service;

import com.expensetracker.dto.CategoryTemplateDto;
import com.expensetracker.dto.OccupationDto;
import com.expensetracker.dto.OccupationWithCategoriesDto;
import com.expensetracker.entity.*;
import com.expensetracker.repository.CategoryRepository;
import com.expensetracker.repository.OccupationCategoryTemplateRepository;
import com.expensetracker.repository.OccupationRepository;
import com.expensetracker.repository.UserRepository;
import com.expensetracker.repository.AdminRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class OccupationService {
    
    @Autowired
    private OccupationRepository occupationRepository;
    
    @Autowired
    private OccupationCategoryTemplateRepository templateRepository;
    
    @Autowired
    private CategoryRepository categoryRepository;
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private AdminRepository adminRepository;
    
    @PersistenceContext
    private EntityManager entityManager;
    
    /**
     * Get all available occupations
     */
    public List<OccupationDto> getAllOccupations() {
        return occupationRepository.findAllByOrderByNameAsc().stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }
    
    /**
     * Get occupation with its category templates
     */
    public OccupationWithCategoriesDto getOccupationWithCategories(Long occupationId) {
        Occupation occupation = occupationRepository.findById(Objects.requireNonNull(occupationId))
                .orElseThrow(() -> new RuntimeException("Occupation not found"));
        
        List<CategoryTemplateDto> categories = templateRepository
                .findByOccupation_IdOrderByDisplayOrderAsc(occupationId)
                .stream()
                .map(template -> new CategoryTemplateDto(
                        template.getCategoryName(),
                        template.getDescription(),
                        template.getColor()
                ))
                .collect(Collectors.toList());
        
        return new OccupationWithCategoriesDto(
                occupation.getId(),
                occupation.getName(),
                occupation.getOccupationType(),
                occupation.getDescription(),
                categories
        );
    }
    
    /**
     * Generate default categories for a user based on their occupation
     * For group users, automatically use the admin's occupation
     */
    public void generateCategoriesForUser(User user, Long occupationId) {
        System.out.println("=== generateCategoriesForUser ===");
        System.out.println("User: " + user.getUsername() + " (ID: " + user.getId() + ")");
        System.out.println("Requested Occupation ID: " + occupationId);
        
        // Refresh user from database to ensure all lazy-loaded relationships are accessible
        User managedUser = userRepository.findById(Objects.requireNonNull(user.getId()))
                .orElseThrow(() -> new RuntimeException("User not found"));
        
        // For group users, override with admin's occupation if admin has one
        if (managedUser.getUserGroup() != null && managedUser.getUserGroup().getAdmin() != null) {
            Admin groupAdmin = managedUser.getUserGroup().getAdmin();
            Optional<User> adminUserOpt = userRepository.findByUsername(groupAdmin.getUsername());
            
            if (adminUserOpt.isPresent()) {
                User adminUser = adminUserOpt.get();
                if (adminUser.getOccupation() != null) {
                    // Use admin's occupation instead of the provided one
                    occupationId = adminUser.getOccupation().getId();
                    System.out.println("User is in group, using admin's occupation ID: " + occupationId);
                }
            }
        }
        
        Occupation occupation = occupationRepository.findById(Objects.requireNonNull(occupationId))
                .orElseThrow(() -> new RuntimeException("Occupation not found"));
        
        System.out.println("Found occupation: " + occupation.getName() + " (Type: " + occupation.getOccupationType() + ")");
        
        // Set user's occupation
        managedUser.setOccupation(occupation);
        userRepository.save(managedUser);
        System.out.println("Updated user's occupation field");
        
        // Get templates for this occupation
        List<OccupationCategoryTemplate> templates = templateRepository
                .findByOccupation_IdOrderByDisplayOrderAsc(occupationId);
        
        System.out.println("Found " + templates.size() + " category templates for this occupation");
        
        // Create categories from templates
        int createdCount = 0;
        for (OccupationCategoryTemplate template : templates) {
            Category category = new Category();
            category.setName(template.getCategoryName());
            category.setDescription(template.getDescription());
            category.setColor(template.getColor());
            category.setUser(managedUser);
            category.setIsDefault(false);
            category.setIsOccupationGenerated(true);
            
            Category saved = categoryRepository.save(category);
            createdCount++;
            System.out.println("Created category: " + saved.getName() + " (ID: " + saved.getId() + ")");
        }
        
        // Flush to ensure all categories are persisted to database immediately
        entityManager.flush();
        
        System.out.println("Total categories created: " + createdCount);
        System.out.println("=== End generateCategoriesForUser ===");
    }
    
    /**
     * Update user's occupation and regenerate categories
     * For group users, this syncs all group members to the admin's occupation
     */
    public void updateUserOccupation(User user, Long occupationId) {
        System.out.println("=== OccupationService.updateUserOccupation ===");
        System.out.println("User ID: " + user.getId() + ", Username: " + user.getUsername());
        System.out.println("New Occupation ID: " + occupationId);
        
        try {
            // Refresh user from database to ensure all lazy-loaded relationships are accessible
            User managedUser = userRepository.findById(Objects.requireNonNull(user.getId()))
                    .orElseThrow(() -> new RuntimeException("User not found"));
            
            // Delete existing occupation-generated categories using efficient query
            System.out.println("Fetching existing occupation-generated categories...");
            List<Category> occupationCategories = categoryRepository.findByUserIdAndIsOccupationGenerated(
                managedUser.getId(), true
            );
            System.out.println("Found " + occupationCategories.size() + " occupation-generated categories to delete");
            
            if (!occupationCategories.isEmpty()) {
                categoryRepository.deleteAll(occupationCategories);
                System.out.println("Deleted " + occupationCategories.size() + " old occupation categories");
            }
            
            // Force flush and clear to ensure changes are visible immediately
            entityManager.flush();
            entityManager.clear();
            
            
            // Generate new categories for the new occupation
            System.out.println("Generating new categories for occupation ID: " + occupationId);
            generateCategoriesForUser(managedUser, occupationId);
            System.out.println("Successfully generated new categories");
            
            // If this is an admin user, also update all group members' occupations
            if (managedUser.getRole() == UserRole.ROLE_ADMIN) {
                System.out.println("User is ADMIN, updating group members...");
                Optional<Admin> adminOpt = adminRepository.findByUsername(managedUser.getUsername());
                if (adminOpt.isPresent()) {
                    Admin admin = adminOpt.get();
                    // Find all users in groups managed by this admin
                    List<User> groupUsers = userRepository.findAll().stream()
                        .filter(u -> u.getUserGroup() != null && 
                                     u.getUserGroup().getAdmin() != null &&
                                     u.getUserGroup().getAdmin().getId().equals(admin.getId()))
                        .collect(Collectors.toList());
                    
                    System.out.println("Found " + groupUsers.size() + " group members to update");
                    
                    // Update each group user's occupation
                    for (User groupUser : groupUsers) {
                        System.out.println("Updating group user: " + groupUser.getUsername());
                        
                        // Delete existing occupation-generated categories using efficient query
                        List<Category> groupOccupationCategories = categoryRepository.findByUserIdAndIsOccupationGenerated(
                            groupUser.getId(), true
                        );
                        if (!groupOccupationCategories.isEmpty()) {
                            categoryRepository.deleteAll(groupOccupationCategories);
                            System.out.println("Deleted " + groupOccupationCategories.size() + " old categories for group user");
                        }
                        
                        // Set the same occupation as admin
                        groupUser.setOccupation(managedUser.getOccupation());
                        userRepository.save(groupUser);
                        
                        // Generate categories from templates
                        List<OccupationCategoryTemplate> templates = templateRepository
                                .findByOccupation_IdOrderByDisplayOrderAsc(occupationId);
                        
                        for (OccupationCategoryTemplate template : templates) {
                            Category category = new Category();
                            category.setName(template.getCategoryName());
                            category.setDescription(template.getDescription());
                            category.setColor(template.getColor());
                            category.setUser(groupUser);
                            category.setIsDefault(false);
                            category.setIsOccupationGenerated(true);
                            
                            categoryRepository.save(category);
                        }
                        System.out.println("Generated " + templates.size() + " new categories for group user");
                    }
                }
            }
            System.out.println("=== Occupation update completed successfully ===");
        } catch (Exception e) {
            System.err.println("ERROR in updateUserOccupation: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("Failed to update occupation: " + e.getMessage(), e);
        }
    }
    
    /**
     * Convert Occupation entity to DTO
     */
    private OccupationDto convertToDto(Occupation occupation) {
        return new OccupationDto(
                occupation.getId(),
                occupation.getName(),
                occupation.getOccupationType(),
                occupation.getDescription()
        );
    }
}
