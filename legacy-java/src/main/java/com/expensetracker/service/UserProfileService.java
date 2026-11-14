package com.expensetracker.service;

import com.expensetracker.dto.ChangePasswordRequest;
import com.expensetracker.dto.UserProfileDto;
import com.expensetracker.dto.UserProfileRequest;
import com.expensetracker.entity.Admin;
import com.expensetracker.entity.Occupation;
import com.expensetracker.entity.User;
import com.expensetracker.entity.UserRole;
import com.expensetracker.repository.AdminRepository;
import com.expensetracker.repository.OccupationRepository;
import com.expensetracker.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;

@Service
@Transactional
public class UserProfileService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;
    
    @Autowired
    private OccupationRepository occupationRepository;
    
    @Autowired
    private AdminRepository adminRepository;

    public UserProfileDto getUserProfile(User user) {
        // Fetch the user from repository to ensure lazy-loaded fields are accessible
        User managedUser = userRepository.findById(Objects.requireNonNull(user.getId()))
            .orElseThrow(() -> new RuntimeException("User not found"));
        
        UserProfileDto dto = new UserProfileDto();
        dto.setId(managedUser.getId());
        dto.setUsername(managedUser.getUsername());
        dto.setEmail(managedUser.getEmail());
        dto.setFirstName(managedUser.getFirstName());
        dto.setLastName(managedUser.getLastName());
        dto.setCountry(managedUser.getCountry());
        dto.setIsOAuthUser(managedUser.getIsOAuthUser());
        
        if (managedUser.getOccupation() != null) {
            dto.setOccupationId(managedUser.getOccupation().getId());
            dto.setOccupationName(managedUser.getOccupation().getName());
        }
        
        return dto;
    }

    public UserProfileDto updateUserProfile(User user, UserProfileRequest request) {
        // Fetch the managed user from repository
        User managedUser = userRepository.findById(Objects.requireNonNull(user.getId()))
            .orElseThrow(() -> new RuntimeException("User not found"));
        
        // Check if username is already taken by another user
        if (!managedUser.getUsername().equals(request.getUsername())) {
            if (userRepository.findByUsername(request.getUsername()).isPresent()) {
                throw new RuntimeException("Username is already taken");
            }
        }

        // Check if email is already taken by another user
        if (!managedUser.getEmail().equals(request.getEmail())) {
            if (userRepository.findByEmail(request.getEmail()).isPresent()) {
                throw new RuntimeException("Email is already taken");
            }
        }

        managedUser.setUsername(request.getUsername());
        managedUser.setEmail(request.getEmail());
        managedUser.setFirstName(request.getFirstName());
        managedUser.setLastName(request.getLastName());
        
        // Check if country is being updated
        boolean countryChanged = managedUser.getCountry() != null && 
                                !managedUser.getCountry().equals(request.getCountry());
        
        managedUser.setCountry(request.getCountry());
        
        // If user is admin and country changed, sync with all group members
        if (countryChanged && managedUser.getRole() == UserRole.ROLE_ADMIN) {
            syncCurrencyWithGroupMembers(managedUser, request.getCountry());
        }
        
        // Update occupation if provided
        if (request.getOccupationId() != null) {
            Occupation occupation = occupationRepository.findById(Objects.requireNonNull(request.getOccupationId()))
                .orElseThrow(() -> new RuntimeException("Occupation not found"));
            managedUser.setOccupation(occupation);
        } else {
            managedUser.setOccupation(null);
        }

        User updatedUser = userRepository.save(managedUser);
        return getUserProfile(updatedUser);
    }
    
    private void syncCurrencyWithGroupMembers(User adminUser, String newCountry) {
        try {
            System.out.println("=== Syncing currency with group members ===");
            System.out.println("Admin: " + adminUser.getUsername() + " changed country to: " + newCountry);
            
            // Find admin entity
            Admin admin = adminRepository.findByUsername(adminUser.getUsername())
                .orElse(null);
            
            if (admin == null) {
                System.out.println("Admin entity not found");
                return;
            }
            
            // Get all managed users
            List<User> managedUsers = userRepository.findByUserGroupAdminId(admin.getId());
            System.out.println("Found " + managedUsers.size() + " managed users");
            
            // Update country for all managed users
            for (User member : managedUsers) {
                member.setCountry(newCountry);
                userRepository.save(member);
                System.out.println("Updated country for user: " + member.getUsername());
            }
            
            System.out.println("Currency sync completed");
        } catch (Exception e) {
            System.err.println("Error syncing currency: " + e.getMessage());
            e.printStackTrace();
        }
    }

    public void changePassword(User user, ChangePasswordRequest request) {
        // Fetch the managed user from repository
        User managedUser = userRepository.findById(Objects.requireNonNull(user.getId()))
            .orElseThrow(() -> new RuntimeException("User not found"));
        
        // For OAuth users setting password for the first time, skip current password verification
        if (managedUser.getIsOAuthUser() && (request.getCurrentPassword() == null || request.getCurrentPassword().isEmpty())) {
            // OAuth user is setting their password for the first time
            managedUser.setPassword(passwordEncoder.encode(request.getNewPassword()));
            managedUser.setIsOAuthUser(false); // No longer OAuth-only after setting password
        } else {
            // Verify current password for non-OAuth users or OAuth users who have set a password
            if (!passwordEncoder.matches(request.getCurrentPassword(), managedUser.getPassword())) {
                throw new RuntimeException("Current password is incorrect");
            }
            // Update password
            managedUser.setPassword(passwordEncoder.encode(request.getNewPassword()));
        }
        
        userRepository.save(managedUser);
    }
}

