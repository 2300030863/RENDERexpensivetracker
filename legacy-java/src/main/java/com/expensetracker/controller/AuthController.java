package com.expensetracker.controller;

import com.expensetracker.dto.JwtResponse;
import com.expensetracker.dto.LoginRequest;
import com.expensetracker.dto.RegisterRequest;
import com.expensetracker.entity.User;
import com.expensetracker.security.JwtTokenUtil;
import com.expensetracker.service.AuthService;
import com.expensetracker.service.EmailOtpService;
import javax.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/auth")

public class AuthController {

    @Autowired
    private AuthenticationManager authenticationManager;

    @Autowired
    private AuthService authService;

    @Autowired
    private EmailOtpService emailOtpService;

    @Autowired
    private JwtTokenUtil jwtTokenUtil;

    @PostMapping("/login")
    public ResponseEntity<?> authenticateUser(@Valid @RequestBody LoginRequest loginRequest) {
        try {
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(loginRequest.getUsername(), loginRequest.getPassword()));

            SecurityContextHolder.getContext().setAuthentication(authentication);
            User user = (User) authentication.getPrincipal();
            String jwt = jwtTokenUtil.generateToken(user);
            boolean isGroupMember = user.getUserGroup() != null;

            return ResponseEntity.ok(new JwtResponse(jwt, user.getId(), user.getUsername(), 
                    user.getEmail(), user.getFirstName(), user.getLastName(), user.getCountry(), user.getRole().name(), isGroupMember));
        } catch (org.springframework.security.authentication.DisabledException e) {
            return ResponseEntity.status(403).body(e.getMessage());
        } catch (org.springframework.security.authentication.BadCredentialsException e) {
            return ResponseEntity.status(401).body("Invalid username or password");
        } catch (Exception e) {
            return ResponseEntity.status(401).body("Authentication failed: " + e.getMessage());
        }
    }

    @PostMapping("/send-otp")
    public ResponseEntity<?> sendOtp(@RequestBody Map<String, String> request) {
        try {
            String email = request.get("email");
            if (email == null || email.isBlank()) {
                return ResponseEntity.badRequest().body("Email is required");
            }
            emailOtpService.sendOtp(email.trim());
            return ResponseEntity.ok(Map.of("message", "OTP sent successfully", "success", true));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage(), "success", false));
        }
    }

    @PostMapping("/verify-otp")
    public ResponseEntity<?> verifyOtp(@RequestBody Map<String, String> request) {
        String email = request.get("email");
        String otp = request.get("otp");
        if (email == null || otp == null) {
            return ResponseEntity.badRequest().body(Map.of("verified", false, "message", "Email and OTP are required"));
        }
        boolean verified = emailOtpService.verifyOtp(email.trim(), otp.trim());
        if (verified) {
            return ResponseEntity.ok(Map.of("verified", true, "message", "Email verified successfully"));
        } else {
            return ResponseEntity.badRequest().body(Map.of("verified", false, "message", "Invalid or expired OTP"));
        }
    }

    @PostMapping("/register")
    public ResponseEntity<?> registerUser(@Valid @RequestBody RegisterRequest registerRequest) {
        // Verify email OTP was completed
        if (!emailOtpService.isEmailVerified(registerRequest.getEmail())) {
            return ResponseEntity.badRequest().body("Email not verified. Please verify your email with OTP first.");
        }

        if (authService.existsByUsername(registerRequest.getUsername())) {
            return ResponseEntity.badRequest().body("Error: Username is already taken!");
        }

        if (authService.existsByEmail(registerRequest.getEmail())) {
            return ResponseEntity.badRequest().body("Error: Email is already in use!");
        }

        User user = authService.registerUser(registerRequest);
        
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(registerRequest.getUsername(), registerRequest.getPassword()));

        SecurityContextHolder.getContext().setAuthentication(authentication);
        User authenticatedUser = (User) authentication.getPrincipal();
        String jwt = jwtTokenUtil.generateToken(authenticatedUser);
        boolean isGroupMember = authenticatedUser.getUserGroup() != null;

        return ResponseEntity.ok(new JwtResponse(jwt, user.getId(), user.getUsername(), 
                user.getEmail(), user.getFirstName(), user.getLastName(), user.getCountry(), user.getRole().name(), isGroupMember));
    }

    @GetMapping("/verify")
    public ResponseEntity<?> verifyToken(@AuthenticationPrincipal User user) {
        boolean isGroupMember = user.getUserGroup() != null;
        return ResponseEntity.ok(new JwtResponse("", user.getId(), user.getUsername(), 
                user.getEmail(), user.getFirstName(), user.getLastName(), user.getCountry(), user.getRole().name(), isGroupMember));
    }

    // Public health check to verify deployment without authentication
    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("OK");
    }

    @PostMapping("/google")
    public ResponseEntity<?> authenticateWithGoogle(@RequestBody Map<String, String> request) {
        try {
            String googleToken = request.get("googleToken");
            
            if (googleToken == null || googleToken.isEmpty()) {
                return ResponseEntity.badRequest().body("Google token is required");
            }
            
            // Decode the JWT token to extract user info (token is already verified by Google on client side)
            String[] parts = googleToken.split("\\.");
            if (parts.length < 2) {
                return ResponseEntity.status(401).body("Invalid Google token format");
            }
            
            // Decode the payload (second part of JWT)
            String payloadJson = new String(java.util.Base64.getUrlDecoder().decode(parts[1]));
            
            // Parse JSON manually to extract email, name
            String email = extractJsonValue(payloadJson, "email");
            String firstName = extractJsonValue(payloadJson, "given_name");
            String lastName = extractJsonValue(payloadJson, "family_name");
            
            if (email == null || email.isEmpty()) {
                return ResponseEntity.status(401).body("Email not found in Google token");
            }
            
            // Find or create user
            User user = authService.findOrCreateGoogleUser(email, firstName, lastName);
            
            // Check if user is blocked
            if (!user.isAccountNonLocked()) {
                return ResponseEntity.status(403).body("Your account has been blocked. Please contact support.");
            }
            
            // Generate JWT token
            String jwt = jwtTokenUtil.generateToken(user);
            boolean isGroupMember = user.getUserGroup() != null;
            
            return ResponseEntity.ok(new JwtResponse(jwt, user.getId(), user.getUsername(), 
                    user.getEmail(), user.getFirstName(), user.getLastName(), user.getCountry(), user.getRole().name(), isGroupMember));
                    
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body("Google authentication failed: " + e.getMessage());
        }
    }
    
    private String extractJsonValue(String json, String key) {
        try {
            String searchKey = "\"" + key + "\"";
            int keyIndex = json.indexOf(searchKey);
            if (keyIndex == -1) return null;
            
            int colonIndex = json.indexOf(":", keyIndex);
            if (colonIndex == -1) return null;
            
            int startQuote = json.indexOf("\"", colonIndex);
            if (startQuote == -1) return null;
            
            int endQuote = json.indexOf("\"", startQuote + 1);
            if (endQuote == -1) return null;
            
            return json.substring(startQuote + 1, endQuote);
        } catch (Exception e) {
            return null;
        }
    }
}

