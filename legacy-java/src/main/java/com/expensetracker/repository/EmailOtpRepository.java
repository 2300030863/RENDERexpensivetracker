package com.expensetracker.repository;

import com.expensetracker.entity.EmailOtp;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface EmailOtpRepository extends JpaRepository<EmailOtp, Long> {

    Optional<EmailOtp> findTopByEmailAndVerifiedFalseOrderByCreatedAtDesc(String email);

    Optional<EmailOtp> findTopByEmailAndVerifiedTrueOrderByCreatedAtDesc(String email);

    void deleteByEmail(String email);
}
