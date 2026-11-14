package com.expensetracker.controller;

import com.expensetracker.dto.OccupationDto;
import com.expensetracker.dto.OccupationWithCategoriesDto;
import com.expensetracker.entity.User;
import com.expensetracker.service.OccupationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/occupations")
public class OccupationController {
    
    @Autowired
    private OccupationService occupationService;
    
    /**
     * Get all available occupations
     * Public endpoint - no authentication required
     */
    @GetMapping
    public ResponseEntity<List<OccupationDto>> getAllOccupations() {
        try {
            List<OccupationDto> occupations = occupationService.getAllOccupations();
            return ResponseEntity.ok(occupations);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    /**
     * Get occupation with its category templates
     * Public endpoint - useful for preview during registration
     */
    @GetMapping("/{id}")
    public ResponseEntity<OccupationWithCategoriesDto> getOccupationWithCategories(@PathVariable Long id) {
        try {
            OccupationWithCategoriesDto occupation = occupationService.getOccupationWithCategories(id);
            return ResponseEntity.ok(occupation);
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    /**
     * Update user's occupation and regenerate categories
     * Requires authentication
     */
    @PutMapping("/update")
    @PreAuthorize("hasAnyAuthority('ROLE_USER', 'ROLE_ADMIN', 'ROLE_OWNER')")
    public ResponseEntity<Map<String, String>> updateUserOccupation(
            @RequestBody Map<String, Long> request,
            @AuthenticationPrincipal User user) {
        try {
            System.out.println("=== Occupation Update Request ===");
            System.out.println("User: " + user.getUsername());
            System.out.println("Request: " + request);
            
            Long occupationId = request.get("occupationId");
            
            if (occupationId == null) {
                System.err.println("ERROR: Occupation ID is null");
                Map<String, String> error = new HashMap<>();
                error.put("message", "Occupation ID is required");
                return ResponseEntity.badRequest().body(error);
            }
            
            System.out.println("Calling occupationService.updateUserOccupation with occupationId: " + occupationId);
            occupationService.updateUserOccupation(user, occupationId);
            System.out.println("Successfully updated occupation for user: " + user.getUsername());
            
            Map<String, String> response = new HashMap<>();
            response.put("message", "Occupation updated successfully");
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            System.err.println("RuntimeException during occupation update: " + e.getMessage());
            e.printStackTrace();
            Map<String, String> error = new HashMap<>();
            error.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        } catch (Exception e) {
            System.err.println("Exception during occupation update: " + e.getMessage());
            e.printStackTrace();
            Map<String, String> error = new HashMap<>();
            error.put("message", "Failed to update occupation: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
}
