package com.pbl6.flashcard.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import com.pbl6.flashcard.security.StrongPassword;
import com.pbl6.flashcard.security.PasswordPolicy;

public class RegisterRequest {
    public static final int MAX_NAME = 100;
    public static final int MIN_PASSWORD = PasswordPolicy.MIN;
    /** BCrypt chỉ dùng 72 byte đầu (Spring Security từ chối mật khẩu dài hơn). */
    public static final int MAX_PASSWORD = 72;
    /** Dùng chung với AuthService.register (miền @deleted.local dành riêng): hai lỗi trông như nhau. */
    public static final String EMAIL_INVALID = "Email không đúng định dạng";

    @NotBlank(message = "Email không được để trống")
    @Email(message = EMAIL_INVALID)
    @Size(max = 255, message = "Email tối đa 255 ký tự")
    private String email;

    @NotBlank(message = "Mật khẩu không được để trống")
    @StrongPassword   // 8..72 ký tự + chữ, số, ký tự đặc biệt (PasswordPolicy); không thêm @Size để không báo hai lần cùng một câu
    private String password;

    @NotBlank(message = "Họ tên không được để trống")
    @Size(max = MAX_NAME, message = "Họ tên tối đa 100 ký tự")
    private String fullName;

    public RegisterRequest() {}

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
}
