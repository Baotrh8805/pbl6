package com.pbl6.flashcard.model;

/**
 * USER = người học. ADMIN / SUPER_ADMIN là staff của Admin Panel (SecurityConfig: ROLE_SUPER_ADMIN > ROLE_ADMIN);
 * staff không dùng API học tập.
 */
public enum Role {
    USER,
    ADMIN,
    SUPER_ADMIN;

    public boolean isStaff() {
        return this != USER;
    }

    /** Bậc để so sánh "chỉ thao tác lên người thấp hơn mình". */
    public int rank() {
        return ordinal();
    }
}
