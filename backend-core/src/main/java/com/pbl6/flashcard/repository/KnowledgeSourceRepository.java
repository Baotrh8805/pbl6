package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.KnowledgeSource;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface KnowledgeSourceRepository extends JpaRepository<KnowledgeSource, UUID> {

    /** Khoá dòng cho mọi thao tác ghi của admin: hai admin cùng PUT không cùng ra version + 1 (mất một bản cập nhật). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT k FROM KnowledgeSource k WHERE k.id = :id")
    Optional<KnowledgeSource> lockById(@Param("id") UUID id);

    /** Một dòng danh sách admin: không nạp content / entries (nặng), chỉ đếm số mục bằng jsonb_array_length. */
    interface Row {
        UUID getId();
        String getTitle();
        String getKind();
        String getLevel();
        int getVersion();
        String getSourceName();
        String getStatus();
        int getEntryCount();
        String getUploadedByEmail();
        Instant getCreatedAt();
        Instant getUpdatedAt();
    }

    /** kind / status rỗng = không lọc; q đã lower + escape bằng AdminUserService.likePattern (rỗng = không lọc). */
    @Query(value = """
            SELECT k.id AS "id", k.title AS "title", k.kind AS "kind", k.level AS "level", k.version AS "version",
                   k.source_name AS "sourceName", k.status AS "status", jsonb_array_length(k.entries) AS "entryCount",
                   u.email AS "uploadedByEmail", k.created_at AS "createdAt", k.updated_at AS "updatedAt"
            FROM knowledge_sources k LEFT JOIN users u ON u.id = k.uploaded_by
            WHERE (:kind = '' OR k.kind = :kind) AND (:status = '' OR k.status = :status)
              AND (:q = '' OR lower(k.title) LIKE :q ESCAPE '!' OR lower(coalesce(k.source_name, '')) LIKE :q ESCAPE '!'
                   OR lower(coalesce(u.email, '')) LIKE :q ESCAPE '!')
            ORDER BY k.updated_at DESC, k.id DESC
            """,
            countQuery = """
            SELECT count(*) FROM knowledge_sources k LEFT JOIN users u ON u.id = k.uploaded_by
            WHERE (:kind = '' OR k.kind = :kind) AND (:status = '' OR k.status = :status)
              AND (:q = '' OR lower(k.title) LIKE :q ESCAPE '!' OR lower(coalesce(k.source_name, '')) LIKE :q ESCAPE '!'
                   OR lower(coalesce(u.email, '')) LIKE :q ESCAPE '!')
            """, nativeQuery = true)
    Page<Row> search(@Param("kind") String kind, @Param("status") String status, @Param("q") String q, Pageable pageable);

    @Query(value = """
            SELECT k.id AS "id", k.title AS "title", k.kind AS "kind", k.level AS "level", k.version AS "version",
                   k.source_name AS "sourceName", k.status AS "status", jsonb_array_length(k.entries) AS "entryCount",
                   u.email AS "uploadedByEmail", k.created_at AS "createdAt", k.updated_at AS "updatedAt"
            FROM knowledge_sources k LEFT JOIN users u ON u.id = k.uploaded_by WHERE k.id = :id
            """, nativeQuery = true)
    Optional<Row> row(@Param("id") UUID id);

    /** Một mục tham chiếu gửi ai-service: {term, reading?, meaning?, level?, sourceId}. */
    interface ReferenceRow {
        String getSourceId();
        String getTerm();
        String getReading();
        String getMeaning();
        String getLevel();
    }

    /**
     * Mục của các nguồn ACTIVE thuộc nhóm kinds (VOCAB / GRAMMAR / KANJI), nguồn mới sửa trước rồi theo thứ tự trong nguồn, tối đa
     * :limit dòng (van an toàn, cắt ngay trong DB). Mục không có term bị bỏ (ai-service đòi term khác rỗng); mục không ghi cấp lấy cấp
     * khai cho cả nguồn.
     */
    @Query(value = """
            SELECT CAST(k.id AS text) AS "sourceId", trim(e.value ->> 'term') AS "term", e.value ->> 'reading' AS "reading",
                   e.value ->> 'meaning' AS "meaning", COALESCE(e.value ->> 'level', k.level) AS "level"
            FROM knowledge_sources k CROSS JOIN LATERAL jsonb_array_elements(k.entries) WITH ORDINALITY AS e(value, ord)
            WHERE k.status = 'ACTIVE' AND k.kind IN (:kinds) AND jsonb_typeof(e.value) = 'object'
              AND coalesce(trim(e.value ->> 'term'), '') <> ''
            ORDER BY k.updated_at DESC, k.id, e.ord
            LIMIT :limit
            """, nativeQuery = true)
    List<ReferenceRow> activeReferences(@Param("kinds") List<String> kinds, @Param("limit") int limit);

    /**
     * Như {@link #activeReferences} nhưng chỉ mục có khoá term nằm trong :keys và không trần — cho kiểm tra lại mâu thuẫn (đã biết term
     * của job). Khoá = term bỏ khoảng trắng / khoảng trắng toàn góc / ～ / 〜 (cùng tập ký tự với KnowledgeSourceService.KEY_STRIP_CHARS,
     * :keys đã tính sẵn ở Java). :keys không được rỗng.
     */
    @Query(value = """
            SELECT CAST(k.id AS text) AS "sourceId", trim(e.value ->> 'term') AS "term", e.value ->> 'reading' AS "reading",
                   e.value ->> 'meaning' AS "meaning", COALESCE(e.value ->> 'level', k.level) AS "level"
            FROM knowledge_sources k CROSS JOIN LATERAL jsonb_array_elements(k.entries) WITH ORDINALITY AS e(value, ord)
            WHERE k.status = 'ACTIVE' AND k.kind IN (:kinds) AND jsonb_typeof(e.value) = 'object'
              AND coalesce(trim(e.value ->> 'term'), '') <> ''
              AND translate(e.value ->> 'term', ' 　～〜', '') IN (:keys)
            ORDER BY k.updated_at DESC, k.id, e.ord
            """, nativeQuery = true)
    List<ReferenceRow> referencesFor(@Param("kinds") List<String> kinds, @Param("keys") List<String> keys);
}
