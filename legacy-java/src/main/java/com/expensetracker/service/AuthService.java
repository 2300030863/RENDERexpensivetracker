package com.expensetracker.service;

import com.expensetracker.dto.RegisterRequest;
import com.expensetracker.entity.User;
import com.expensetracker.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class AuthService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;
    
    @Autowired
    private OccupationService occupationService;

    public boolean existsByUsername(String username) {
        return userRepository.existsByUsername(username);
    }

    public boolean existsByEmail(String email) {
        return userRepository.existsByEmail(email);
    }

    public User registerUser(RegisterRequest registerRequest) {
        User user = new User();
        user.setUsername(registerRequest.getUsername());
        user.setEmail(registerRequest.getEmail());
        user.setPassword(passwordEncoder.encode(registerRequest.getPassword()));
        user.setFirstName(registerRequest.getFirstName());
        user.setLastName(registerRequest.getLastName());
        user.setCountry(registerRequest.getCountry());
        
        // Set role if provided, otherwise defaults to ROLE_USER
        if (registerRequest.getRole() != null && !registerRequest.getRole().isEmpty()) {
            try {
                user.setRole(com.expensetracker.entity.UserRole.valueOf(registerRequest.getRole()));
            } catch (IllegalArgumentException e) {
                // If invalid role, keep default ROLE_USER
            }
        }

        User savedUser = userRepository.save(user);
        
        // Generate occupation-based categories if occupation is provided
        if (registerRequest.getOccupationId() != null) {
            try {
                occupationService.generateCategoriesForUser(savedUser, registerRequest.getOccupationId());
            } catch (Exception e) {
                // Log error but don't fail registration
                System.err.println("Failed to generate occupation categories: " + e.getMessage());
            }
        }
        
        return savedUser;
    }

    public User findOrCreateGoogleUser(String email, String firstName, String lastName) {
        Optional<User> existingUser = userRepository.findByEmail(email);
        
        if (existingUser.isPresent()) {
            return existingUser.get();
        }
        
        // Create new user from Google account
        User newUser = new User();
        newUser.setEmail(email);
        newUser.setFirstName(firstName != null ? firstName : "");
        newUser.setLastName(lastName != null ? lastName : "");
        
        // Generate unique username from email
        String baseUsername = email.split("@")[0];
        String username = baseUsername;
        int counter = 1;
        while (userRepository.existsByUsername(username)) {
            username = baseUsername + counter;
            counter++;
        }
        newUser.setUsername(username);
        
        // Set a random password (won't be used for Google OAuth login)
        newUser.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
        
        // Mark as OAuth user
        newUser.setIsOAuthUser(true);
        
        // Set default country
        newUser.setCountry("US");
        
        return userRepository.save(newUser);
    }
}



