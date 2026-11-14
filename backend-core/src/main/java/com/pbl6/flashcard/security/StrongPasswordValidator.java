package com.pbl6.flashcard.security;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class StrongPasswordValidator implements ConstraintValidator<StrongPassword, String> {
    @Override
    public boolean isValid(String value, ConstraintValidatorContext ctx) {
        if (value == null || value.isBlank()) return true; // @NotBlank lo phần rỗng
        String err = PasswordPolicy.check(value);
        if (err == null) return true;
        ctx.disableDefaultConstraintViolation();
        ctx.buildConstraintViolationWithTemplate(err).addConstraintViolation();
        return false;
    }
}
