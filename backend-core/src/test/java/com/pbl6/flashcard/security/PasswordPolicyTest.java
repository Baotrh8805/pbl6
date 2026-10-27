package com.pbl6.flashcard.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Chính sách mật khẩu 27/10: 8–72 ký tự, có chữ, số và ký tự đặc biệt. */
class PasswordPolicyTest {

    @Test
    void accepts_strong_passwords() {
        for (String ok : new String[] {"Secret123!", "a1!aaaaa", "mật-khẩu-9", "P@ssw0rd", "12345678x_", "ABCDEFG1#"}) {
            assertNull(PasswordPolicy.check(ok), ok);
            assertTrue(PasswordPolicy.isValid(ok), ok);
        }
    }

    @Test
    void rejects_weak_passwords_with_one_message() {
        for (String bad : new String[] {"secret123", "Secret!!", "12345678!", "Short1!", "a".repeat(73) + "1!", "OnlyLetters!"}) {
            assertEquals(PasswordPolicy.MESSAGE, PasswordPolicy.check(bad), bad);
            assertFalse(PasswordPolicy.isValid(bad), bad);
        }
        assertEquals("Mật khẩu không được để trống", PasswordPolicy.check(""));
        assertEquals("Mật khẩu không được để trống", PasswordPolicy.check(null));
        assertEquals("Mật khẩu không được bắt đầu hoặc kết thúc bằng khoảng trắng", PasswordPolicy.check(" Secret123! "));
    }
}
