package com.expensetracker.repository;

import com.expensetracker.entity.Occupation;
import com.expensetracker.entity.OccupationCategoryTemplate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface OccupationCategoryTemplateRepository extends JpaRepository<OccupationCategoryTemplate, Long> {
    
    List<OccupationCategoryTemplate> findByOccupationOrderByDisplayOrderAsc(Occupation occupation);
    
    List<OccupationCategoryTemplate> findByOccupation_IdOrderByDisplayOrderAsc(Long occupationId);
}
