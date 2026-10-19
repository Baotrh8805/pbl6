package com.pbl6.flashcard.config;

import org.springframework.http.HttpStatusCode;
import org.springframework.web.server.ResponseStatusException;

/**
 * ResponseStatusException kèm mã lỗi cho máy đọc: ApiExceptionHandler thêm {@code code} vào JSON lỗi. Dùng khi frontend phải rẽ
 * nhánh theo lý do chứ không chỉ theo mã HTTP (vd. 403 vì chưa xác thực email -> hiện nút "Gửi lại email", khác 403 vì bị khoá).
 * Là ResponseStatusException nên mọi chỗ đang bắt / kiểm tra kiểu đó vẫn chạy như cũ.
 */
public class CodedStatusException extends ResponseStatusException {

    private final String code;

    public CodedStatusException(HttpStatusCode status, String code, String reason) {
        super(status, reason);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
