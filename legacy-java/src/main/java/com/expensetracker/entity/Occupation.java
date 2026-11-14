package com.expensetracker.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import javax.persistence.*;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Entity representing different occupation types
 * Each occupation has predefined expense categories
 */
@Entity
@Table(name = "occupations", indexes = {
    @Index(name = "idx_occupation_type", columnList = "occupation_type")
})
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class Occupation {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotBlank
    @Size(max = 100)
    @Column(name = "name", unique = true)
    private String name;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "occupation_type", nullable = false, length = 50)
    private OccupationType occupationType;
    
    @Size(max = 500)
    private String description;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    @OneToMany(mappedBy = "occupation", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JsonIgnore
    private List<OccupationCategoryTemplate> categoryTemplates;
    
    @OneToMany(mappedBy = "occupation", fetch = FetchType.LAZY)
    @JsonIgnore
    private List<User> users;
    
    public Occupation() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }
    
    public Occupation(String name, OccupationType occupationType, String description) {
        this();
        this.name = name;
        this.occupationType = occupationType;
        this.description = description;
    }
    
    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
    
    // Getters and Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
    
    public OccupationType getOccupationType() {
        return occupationType;
    }
    
    public void setOccupationType(OccupationType occupationType) {
        this.occupationType = occupationType;
    }
    
    public String getDescription() {
        return description;
    }
    
    public void setDescription(String description) {
        this.description = description;
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    
    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
    
    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
    
    public List<OccupationCategoryTemplate> getCategoryTemplates() {
        return categoryTemplates;
    }
    
    public void setCategoryTemplates(List<OccupationCategoryTemplate> categoryTemplates) {
        this.categoryTemplates = categoryTemplates;
    }
    
    public List<User> getUsers() {
        return users;
    }
    
    public void setUsers(List<User> users) {
        this.users = users;
    }
}
