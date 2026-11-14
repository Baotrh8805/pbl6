package com.pbl6.flashcard.config;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;

import java.util.stream.Collectors;

/**
 * Một định dạng lỗi cho mọi endpoint: {status, error, message} (+ {@code code} khi lỗi mang mã, xem {@link CodedStatusException}).
 * frontend extractErrorMessage đọc "message". Không bao giờ trả stack trace hay message nội bộ của exception không lường trước.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    /** code: mã lỗi cho máy đọc (hợp đồng API đợt 2, vd. EMAIL_NOT_VERIFIED); null -> không có trong JSON, giữ định dạng cũ. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ApiError(int status, String error, String message, String code) {
        public ApiError(int status, String error, String message) {
            this(status, error, message, null);
        }
    }

    public static ResponseEntity<ApiError> error(HttpStatusCode status, String message) {
        return error(status, message, null);
    }

    public static ResponseEntity<ApiError> error(HttpStatusCode status, String message, String code) {
        HttpStatus known = HttpStatus.resolve(status.value());
        String reason = known != null ? known.getReasonPhrase() : String.valueOf(status.value());
        return ResponseEntity.status(status).body(new ApiError(status.value(), reason, message != null ? message : reason, code));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> onInvalidBody(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + ": " + f.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return error(HttpStatus.BAD_REQUEST, message);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiError> onInvalidParams(HandlerMethodValidationException e) {
        String message = e.getAllErrors().stream()
                .map(MessageSourceResolvable::getDefaultMessage)
                .collect(Collectors.joining("; "));
        return error(HttpStatus.BAD_REQUEST, message);
    }

    /** Phần tử List body vi phạm @Size/@NotBlank (controller có @Validated). */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiError> onConstraintViolation(ConstraintViolationException e) {
        String message = e.getConstraintViolations().stream()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .sorted()
                .collect(Collectors.joining("; "));
        return error(HttpStatus.BAD_REQUEST, message);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> onUnreadable(HttpMessageNotReadableException e) {
        return error(HttpStatus.BAD_REQUEST, "Dữ liệu gửi lên không đúng định dạng JSON.");
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiError> onTypeMismatch(MethodArgumentTypeMismatchException e) {
        return error(HttpStatus.BAD_REQUEST, "Tham số '" + e.getName() + "' không hợp lệ.");
    }

    /** Đua ghi (2 request cùng lúc) chạm ràng buộc unique/FK: 409 thay vì 500. */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> onConflict(DataIntegrityViolationException e) {
        log.warn("Vi phạm ràng buộc dữ liệu: {}", e.getMostSpecificCause().getMessage());
        return error(HttpStatus.CONFLICT, "Dữ liệu xung đột với bản ghi hiện có, vui lòng thử lại.");
    }

    /** Upload vượt spring.servlet.multipart.max-file-size: 413 với thông điệp rõ ràng thay vì 500. */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiError> onTooLarge(MaxUploadSizeExceededException e) {
        return error(HttpStatus.PAYLOAD_TOO_LARGE, "File vượt quá 15 MB.");
    }

    /** @PreAuthorize từ chối bên trong controller: 403, không để rơi vào onOther thành 500. */
    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    public ResponseEntity<ApiError> onAccessDenied(org.springframework.security.access.AccessDeniedException e) {
        return error(HttpStatus.FORBIDDEN, "Bạn không có quyền thực hiện thao tác này.");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> onOther(Exception e) {
        // ResponseStatusException, NoResourceFoundException, 405... đều là ErrorResponse có sẵn mã HTTP
        if (e instanceof CodedStatusException coded) {
            return error(coded.getStatusCode(), coded.getReason(), coded.getCode());
        }
        if (e instanceof ResponseStatusException rse) {
            return error(rse.getStatusCode(), rse.getReason());
        }
        if (e instanceof ErrorResponse er) {
            return error(er.getStatusCode(), er.getBody().getDetail());
        }
        log.error("Lỗi không lường trước", e);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "Đã xảy ra lỗi hệ thống.");
    }
}
