package com.expensetracker.repository;

import com.expensetracker.entity.Occupation;
import com.expensetracker.entity.OccupationType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface OccupationRepository extends JpaRepository<Occupation, Long> {
    
    Optional<Occupation> findByOccupationType(OccupationType occupationType);
    
    List<Occupation> findAllByOrderByNameAsc();
    
    boolean existsByOccupationType(OccupationType occupationType);
}
