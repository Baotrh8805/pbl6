package com.pbl6.flashcard.dto.knowledge;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.pbl6.flashcard.repository.KnowledgeSourceRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Response của Admin Panel > Nguồn tri thức chuẩn (hợp đồng đợt 2 §5, /api/admin/knowledge-sources). */
public final class KnowledgeDtos {

    private KnowledgeDtos() {}

    /** Xem trước nội dung ở trang chi tiết: đủ để quản trị nhận ra tài liệu, không trả cả văn bản 50.000 ký tự. */
    public static final int PREVIEW_CHARS = 4000;
    public static final int PREVIEW_ENTRIES = 500;

    /** Một phần tử danh sách; uploadedByEmail vắng khi người tải đã xoá tài khoản (uploaded_by SET NULL). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Item(UUID id, String title, String kind, String level, int version, String sourceName, String status,
                       int entryCount, String uploadedByEmail, Instant createdAt, Instant updatedAt) {
        public static Item of(KnowledgeSourceRepository.Row r) {
            return new Item(r.getId(), r.getTitle(), r.getKind(), r.getLevel(), r.getVersion(), r.getSourceName(),
                    r.getStatus(), r.getEntryCount(), r.getUploadedByEmail(), r.getCreatedAt(), r.getUpdatedAt());
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Entry(String term, String reading, String meaning, String level) {}

    /** Phần tử + contentPreview (≤ {@value #PREVIEW_CHARS} ký tự) + entries (≤ {@value #PREVIEW_ENTRIES} mục đầu). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Detail(UUID id, String title, String kind, String level, int version, String sourceName, String status,
                         int entryCount, String uploadedByEmail, Instant createdAt, Instant updatedAt,
                         String contentPreview, List<Entry> entries) {}
}
