package com.pbl6.flashcard.model;

/**
 * USER = người học. Ba vai trò còn lại là staff của Admin Panel, lồng nhau theo thứ tự khai báo
 * (SecurityConfig: ROLE_SUPER_ADMIN > ROLE_ADMIN > ROLE_VIEWER); staff không dùng API học tập.
 */
public enum Role {
    USER,
    VIEWER,
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
