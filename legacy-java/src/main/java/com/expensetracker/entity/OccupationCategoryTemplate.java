package com.expensetracker.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import javax.persistence.*;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

import java.time.LocalDateTime;

/**
 * Template entity that defines default expense categories for each occupation type
 * These templates are used to auto-generate categories when a user selects an occupation
 */
@Entity
@Table(name = "occupation_category_templates", indexes = {
    @Index(name = "idx_template_occupation", columnList = "occupation_id")
})
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class OccupationCategoryTemplate {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "occupation_id", nullable = false)
    @JsonIgnore
    private Occupation occupation;
    
    @NotBlank
    @Size(max = 100)
    @Column(name = "category_name")
    private String categoryName;
    
    @Size(max = 500)
    private String description;
    
    @Size(max = 7)
    private String color; // Hex color code
    
    @Column(name = "display_order")
    private Integer displayOrder;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    public OccupationCategoryTemplate() {
        this.createdAt = LocalDateTime.now();
    }
    
    public OccupationCategoryTemplate(Occupation occupation, String categoryName, String description, String color, Integer displayOrder) {
        this();
        this.occupation = occupation;
        this.categoryName = categoryName;
        this.description = description;
        this.color = color;
        this.displayOrder = displayOrder;
    }
    
    // Getters and Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public Occupation getOccupation() {
        return occupation;
    }
    
    public void setOccupation(Occupation occupation) {
        this.occupation = occupation;
    }
    
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
    
    public Integer getDisplayOrder() {
        return displayOrder;
    }
    
    public void setDisplayOrder(Integer displayOrder) {
        this.displayOrder = displayOrder;
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
