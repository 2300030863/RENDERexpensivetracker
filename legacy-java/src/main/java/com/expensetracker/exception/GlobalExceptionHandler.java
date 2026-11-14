package com.expensetracker.exception;

import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import java.util.HashMap;
import java.util.Map;

@ControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidationExceptions(MethodArgumentNotValidException ex) {
        FieldError firstError = ex.getBindingResult().getFieldErrors().stream().findFirst().orElse(null);
        String errorMessage = "Validation error";
        if (firstError != null) {
            errorMessage = firstError.getField() + ": " + firstError.getDefaultMessage();
        }
        
        Map<String, String> response = new HashMap<>();
        response.put("error", errorMessage);
        
        return ResponseEntity.badRequest().body(response);
    }
}
