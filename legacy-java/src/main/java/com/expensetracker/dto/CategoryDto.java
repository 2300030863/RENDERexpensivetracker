package com.expensetracker.dto;

public class CategoryDto {
    private Long id;
    private String name;
    private String description;
    private String color;
    private Boolean isDefault;
    private Boolean isOccupationGenerated;
    private UserBasicDto user;  // Add user information

    public CategoryDto() {}

    public CategoryDto(Long id, String name, String description, String color, Boolean isDefault) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.color = color;
        this.isDefault = isDefault;
    }

    public CategoryDto(Long id, String name, String description, String color, Boolean isDefault, Boolean isOccupationGenerated) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.color = color;
        this.isDefault = isDefault;
        this.isOccupationGenerated = isOccupationGenerated;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public Boolean getIsDefault() { return isDefault; }
    public void setIsDefault(Boolean isDefault) { this.isDefault = isDefault; }
    public Boolean getIsOccupationGenerated() { return isOccupationGenerated; }
    public void setIsOccupationGenerated(Boolean isOccupationGenerated) { this.isOccupationGenerated = isOccupationGenerated; }
    public UserBasicDto getUser() { return user; }
    public void setUser(UserBasicDto user) { this.user = user; }
    
    // Inner class for basic user info
    public static class UserBasicDto {
        private Long id;
        private String username;
        
        public UserBasicDto(Long id, String username) {
            this.id = id;
            this.username = username;
        }
        
        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
    }
}


