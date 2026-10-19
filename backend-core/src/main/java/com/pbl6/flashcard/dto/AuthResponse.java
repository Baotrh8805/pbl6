package com.pbl6.flashcard.dto;

import com.pbl6.flashcard.model.Role;

public class AuthResponse {
    private String accessToken;
    private String refreshToken;
    private String tokenType = "Bearer";
    /** Frontend điều hướng staff vào /admin ngay sau đăng nhập, không chờ /auth/me. */
    private Role role;

    /** Staff: còn phải đổi mật khẩu seed trước khi vào Admin Panel (frontend đưa tới /setup). */
    private boolean mustChangePassword;

    public AuthResponse(String accessToken, String refreshToken, Role role) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.role = role;
    }

    public AuthResponse(String accessToken, String refreshToken, Role role, boolean mustChangePassword) {
        this(accessToken, refreshToken, role);
        this.mustChangePassword = mustChangePassword;
    }

    public boolean isMustChangePassword() { return mustChangePassword; }

    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }

    public String getAccessToken() { return accessToken; }
    public void setAccessToken(String accessToken) { this.accessToken = accessToken; }

    public String getRefreshToken() { return refreshToken; }
    public void setRefreshToken(String refreshToken) { this.refreshToken = refreshToken; }

    public String getTokenType() { return tokenType; }
    public void setTokenType(String tokenType) { this.tokenType = tokenType; }
}
