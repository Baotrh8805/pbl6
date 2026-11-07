package com.pbl6.flashcard.config;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.cors.DefaultCorsProcessor;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Như DefaultCorsProcessor nhưng origin không nằm trong app.cors.allowed-origins nhận 403 cùng định dạng mọi lỗi khác
 * ({status, error, message} của {@link ApiExceptionHandler}) với thông điệp tiếng Việt, thay vì chữ thô "Invalid CORS request" —
 * đi qua proxy /api cùng origin (Vite) thì trang đọc được body và frontend hiện nguyên chữ đó cho người dùng.
 */
public class JsonCorsProcessor extends DefaultCorsProcessor {

    static final String MESSAGE = "Máy chủ từ chối yêu cầu từ địa chỉ trang này (CORS). Hãy mở ứng dụng bằng đúng địa chỉ đã"
            + " cấu hình.";

    @Override
    protected void rejectRequest(ServerHttpResponse response) throws IOException {
        response.setStatusCode(HttpStatus.FORBIDDEN);
        response.getHeaders().setContentType(new MediaType(MediaType.APPLICATION_JSON, StandardCharsets.UTF_8));
        String body = "{\"status\":403,\"error\":\"" + HttpStatus.FORBIDDEN.getReasonPhrase() + "\",\"message\":\"" + MESSAGE + "\"}";
        response.getBody().write(body.getBytes(StandardCharsets.UTF_8));
        response.flush();
    }
}
