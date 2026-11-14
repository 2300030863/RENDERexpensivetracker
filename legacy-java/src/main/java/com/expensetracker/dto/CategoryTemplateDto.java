package com.expensetracker.dto;

public class CategoryTemplateDto {
    
    private String categoryName;
    private String description;
    private String color;
    
    public CategoryTemplateDto() {}
    
    public CategoryTemplateDto(String categoryName, String description, String color) {
        this.categoryName = categoryName;
        this.description = description;
        this.color = color;
    }
    
    // Getters and Setters
    public String getCategoryName() {
        return categoryName;
    }
    
    public void setCategoryName(String categoryName) {
        this.categoryName = categoryName;
    }
    
    public String getDescription() {
        return description;
    }
    
    public void setDescription(String description) {
        this.description = description;
    }
    
    public String getColor() {
        return color;
    }
    
    public void setColor(String color) {
        this.color = color;
    }
}
