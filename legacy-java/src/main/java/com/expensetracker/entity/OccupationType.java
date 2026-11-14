package com.expensetracker.entity;

/**
 * Enum representing different occupation types
 */
public enum OccupationType {
    STUDENT("Student"),
    SOFTWARE_ENGINEER("Software Engineer"),
    BUSINESS_OWNER("Business Owner / UMKM"),
    DELIVERY_DRIVER("Delivery Driver / Ojek Partner"),
    FREELANCER("Freelancer / Creator"),
    HOMEMAKER("Homemaker"),
    SALARIED_EMPLOYEE("Salaried Employee"),
    GOVERNMENT_EMPLOYEE("Government Employee"),
    RETAIL_SHOP_OWNER("Retail Shop Owner / Warung"),
    ONLINE_SELLER("Online Seller"),
    FARMER("Farmer"),
    OTHER("Other");
    
    private final String displayName;
    
    OccupationType(String displayName) {
        this.displayName = displayName;
    }
    
    public String getDisplayName() {
        return displayName;
    }
}
