package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.knowledge.KnowledgeDtos;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.KnowledgeSourceService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.UUID;

/**
 * Admin Panel > Nguồn tri thức chuẩn (G4, hợp đồng đợt 2 §5; ADMIN trở lên, xoá hẳn chỉ SUPER_ADMIN). Nguồn ACTIVE loại VOCAB /
 * GRAMMAR / KANJI làm tham chiếu ghi đè từ điển khi cảnh báo mâu thuẫn trong bóc tách. Mỗi thao tác ghi một dòng audit
 * (target KNOWLEDGE_SOURCE).
 */
@RestController
@RequestMapping("/api/admin/knowledge-sources")
@Validated
public class AdminKnowledgeSourceController {

    private final KnowledgeSourceService service;

    public AdminKnowledgeSourceController(KnowledgeSourceService service) {
        this.service = service;
    }

    /** q khớp tiêu đề, tên file hoặc email người tải; mới sửa trước. */
    @GetMapping
    public AdminPage<KnowledgeDtos.Item> list(
            @RequestParam(required = false) @Pattern(regexp = "VOCAB|GRAMMAR|KANJI|OTHER") String kind,
            @RequestParam(required = false) @Pattern(regexp = "ACTIVE|ARCHIVED") String status,
            @RequestParam(required = false) @Size(max = 100) String q,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.list(kind, status, q, page, size);
    }

    @GetMapping("/{id}")
    public KnowledgeDtos.Detail detail(@PathVariable UUID id) {
        return service.detail(id);
    }

    /** multipart: file HOẶC text, title, kind (VOCAB|GRAMMAR|KANJI|OTHER), level? (N5..N1); ≤ 2 MB / 20 trang. 201 chi tiết. */
    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<KnowledgeDtos.Detail> upload(@AuthenticationPrincipal CustomUserDetails me,
                                                       @RequestPart(value = "file", required = false) MultipartFile file,
                                                       @RequestPart(value = "text", required = false) String text,
                                                       @RequestPart(value = "title", required = false) String title,
                                                       @RequestPart(value = "kind", required = false) String kind,
                                                       @RequestPart(value = "level", required = false) String level) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.upload(me.getUser(), bytes(file),
                file != null && !file.isEmpty() ? file.getOriginalFilename() : null, text, title, kind, level));
    }

    /** Như POST: thay nội dung = phiên bản mới (version + 1), trạng thái giữ nguyên. */
    @PutMapping(value = "/{id}", consumes = "multipart/form-data")
    public KnowledgeDtos.Detail update(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                       @RequestPart(value = "file", required = false) MultipartFile file,
                                       @RequestPart(value = "text", required = false) String text,
                                       @RequestPart(value = "title", required = false) String title,
                                       @RequestPart(value = "kind", required = false) String kind,
                                       @RequestPart(value = "level", required = false) String level) {
        return service.update(me.getUser(), id, bytes(file),
                file != null && !file.isEmpty() ? file.getOriginalFilename() : null, text, title, kind, level);
    }

    /** Ngừng dùng làm tham chiếu (giữ dữ liệu); đã lưu trữ -> 409. */
    @PostMapping("/{id}/archive")
    public KnowledgeDtos.Item archive(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id) {
        return service.archive(me.getUser(), id);
    }

    /** Dùng lại làm tham chiếu; đang dùng -> 409. */
    @PostMapping("/{id}/activate")
    public KnowledgeDtos.Item activate(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id) {
        return service.activate(me.getUser(), id);
    }

    /** Xoá hẳn: chỉ SUPER_ADMIN (ADMIN dùng lưu trữ). 204. */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id) {
        service.delete(me.getUser(), id);
        return ResponseEntity.noContent().build();
    }

    private static byte[] bytes(MultipartFile file) {
        if (file == null || file.isEmpty()) return null;
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không đọc được file tải lên.");
        }
    }
}
