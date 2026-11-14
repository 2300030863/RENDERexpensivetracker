package com.expensetracker.dto;

import com.expensetracker.entity.OccupationType;

public class OccupationDto {
    
    private Long id;
    private String name;
    private OccupationType occupationType;
    private String description;
    
    public OccupationDto() {}
    
    public OccupationDto(Long id, String name, OccupationType occupationType, String description) {
        this.id = id;
        this.name = name;
        this.occupationType = occupationType;
        this.description = description;
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
}
