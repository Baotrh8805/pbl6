package com.pbl6.flashcard.security;

/**
 * Chính sách mật khẩu (rà soát 27/10): tối thiểu 8 ký tự, tối đa 72 (BCrypt chỉ dùng 72 byte đầu), có ít nhất một chữ cái, một chữ
 * số và một ký tự đặc biệt (không phải chữ / số), không có khoảng trắng ở đầu / cuối. Dùng cho đăng ký, đổi mật khẩu, đặt lại mật
 * khẩu và trang /setup của staff qua {@link StrongPassword}; frontend lặp lại cùng quy tắc ở lib/passwordRules.ts để báo sớm.
 * Mật khẩu đã đặt trước ngày này không bị ép đổi (chỉ kiểm khi đặt mới).
 */
public final class PasswordPolicy {
    public static final int MIN = 8;
    public static final int MAX = 72;
    public static final String MESSAGE =
            "Mật khẩu phải từ 8 đến 72 ký tự, có ít nhất một chữ cái, một chữ số và một ký tự đặc biệt (ví dụ ! @ # $ % _ -)";

    private PasswordPolicy() {}

    /** null = hợp lệ; ngược lại là câu báo lỗi (tiếng Việt, dùng thẳng cho client). */
    public static String check(String password) {
        if (password == null || password.isBlank()) return "Mật khẩu không được để trống";
        if (!password.equals(password.strip())) return "Mật khẩu không được bắt đầu hoặc kết thúc bằng khoảng trắng";
        if (password.length() < MIN || password.length() > MAX) return MESSAGE;
        boolean letter = false, digit = false, special = false;
        for (int i = 0; i < password.length(); i++) {
            char c = password.charAt(i);
            if (Character.isLetter(c)) letter = true;
            else if (Character.isDigit(c)) digit = true;
            else if (!Character.isWhitespace(c)) special = true;
        }
        return letter && digit && special ? null : MESSAGE;
    }

    public static boolean isValid(String password) {
        return check(password) == null;
    }
}
