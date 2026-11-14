package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.ExtractionJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ExtractionJobRepository extends JpaRepository<ExtractionJob, UUID> {

    Optional<ExtractionJob> findByIdAndUserId(UUID id, Long userId);

    List<ExtractionJob> findTop50ByUserIdOrderByCreatedAtDesc(Long userId);

    List<ExtractionJob> findTop50ByUserIdAndPurposeOrderByCreatedAtDesc(Long userId, String purpose);

    /** Giới hạn lượt bóc tách mỗi ngày: đếm theo DB để bền qua restart. */
    long countByUserIdAndCreatedAtAfter(Long userId, Instant since);

    /**
     * Hạn mức 24 giờ (spec 21/10): job FAILED vì AI quá tải (failure_kind = AI_OVERLOADED) không tính; dòng CANCELLED của lộ
     * trình đã xoá (LP-10) không có failure_kind nên vẫn tính như cũ.
     */
    long countByUserIdAndCreatedAtAfterAndFailureKindIsNull(Long userId, Instant since);

    long countByUserId(Long userId);

    long countByStatus(String status);

    long countByStatusIn(java.util.Collection<String> statuses);

    /** Số job mỗi ngày theo múi giờ hiển thị (created_at là timestamptz). */
    @Query(value = "SELECT CAST(created_at AT TIME ZONE :zone AS date) AS day, count(*) AS n FROM extraction_jobs "
            + "WHERE created_at >= :since GROUP BY day", nativeQuery = true)
    List<DayCount> countByDay(@Param("since") Instant since, @Param("zone") String zone);

    /**
     * Engine bước TEXT của một job: text_meta.engine (tesseract | gemini | pdf-text | docx | text); job hỏng trước khi có text_meta
     * (hoặc dòng cũ) suy từ source_type: ảnh -> tesseract (ocrMode chỉ là auto/vertical/horizontal, Gemini chỉ là đường dự phòng),
     * txt / dán -> text, còn lại giữ nguyên (pdf, docx).
     */
    String ENGINE_SQL = "COALESCE(NULLIF(text_meta->>'engine', ''), CASE source_type WHEN 'image' THEN 'tesseract' "
            + "WHEN 'txt' THEN 'text' ELSE source_type END)";

    /**
     * G6 (hợp đồng đợt 2 §8): hiệu suất từng engine trên job đã kết thúc (DONE / FAILED, bỏ CANCELLED) tạo từ :since.
     * avgConfidence = trung bình text_meta.meanConfidence (0..1, chỉ OCR có); avgSeconds = finished_at - started_at của job DONE
     * (job "Phân tích lại" đặt lại started_at nên chỉ đo lượt chạy gần nhất).
     */
    @Query(value = "SELECT " + ENGINE_SQL + " AS \"engine\", count(*) AS \"total\", "
            + "count(*) FILTER (WHERE status = 'FAILED') AS \"failed\", "
            + "count(*) FILTER (WHERE text_meta->>'lowConfidence' = 'true') AS \"lowConfidence\", "
            + "CAST(avg(CASE WHEN jsonb_typeof(text_meta->'meanConfidence') = 'number' "
            + "THEN CAST(text_meta->>'meanConfidence' AS double precision) END) AS double precision) AS \"avgConfidence\", "
            + "CAST(avg(CASE WHEN status = 'DONE' AND started_at IS NOT NULL AND finished_at >= started_at "
            + "THEN EXTRACT(EPOCH FROM finished_at - started_at) END) AS double precision) AS \"avgSeconds\" "
            + "FROM extraction_jobs WHERE created_at >= :since AND status IN ('DONE', 'FAILED') "
            + "GROUP BY 1 ORDER BY 2 DESC, 1", nativeQuery = true)
    List<AiEngineStatRow> engineStats(@Param("since") Instant since);

    /**
     * G6: chuỗi OCR theo ngày (múi :zone) — job nguồn ảnh / PDF đã kết thúc, trừ PDF có lớp chữ (engine pdf-text: không OCR).
     * geminiFallback = Tesseract tin cậy thấp nên ai-service chuyển Gemini chép lại (engine = gemini).
     */
    @Query(value = "SELECT CAST(created_at AT TIME ZONE :zone AS date) AS \"day\", count(*) AS \"ocrJobs\", "
            + "count(*) FILTER (WHERE status = 'FAILED') AS \"failed\", "
            + "count(*) FILTER (WHERE text_meta->>'lowConfidence' = 'true') AS \"lowConfidence\", "
            + "count(*) FILTER (WHERE text_meta->>'engine' = 'gemini') AS \"geminiFallback\" "
            + "FROM extraction_jobs WHERE created_at >= :since AND source_type IN ('image', 'pdf') "
            + "AND status IN ('DONE', 'FAILED') AND COALESCE(text_meta->>'engine', '') <> 'pdf-text' "
            + "GROUP BY 1", nativeQuery = true)
    List<OcrDayRow> ocrByDay(@Param("since") Instant since, @Param("zone") String zone);

    /**
     * G6: bước dịch nghĩa VI của job tạo từ :since. Chỉ đếm job đã thật sự gọi enrich (stats.enriched = true hoặc có
     * stats.enrichReason: quota | error | no_api_key); job không cần dịch (nghĩa EN, mọi nghĩa VI đã có) không vào total.
     */
    @Query(value = "SELECT count(*) AS \"total\", count(*) FILTER (WHERE stats->>'enriched' = 'true') AS \"enriched\", "
            + "count(*) FILTER (WHERE stats->>'enrichReason' = 'quota') AS \"quota\", "
            + "count(*) FILTER (WHERE stats->>'enrichReason' = 'error') AS \"error\" "
            + "FROM extraction_jobs WHERE created_at >= :since "
            + "AND (stats->>'enriched' = 'true' OR stats->>'enrichReason' IS NOT NULL)", nativeQuery = true)
    EnrichStatRow enrichStats(@Param("since") Instant since);

    /** Admin: mọi job; status/userId null = không lọc. */
    @Query("SELECT j FROM ExtractionJob j WHERE (:status IS NULL OR j.status = :status) "
            + "AND (:userId IS NULL OR j.userId = :userId) ORDER BY j.createdAt DESC")
    org.springframework.data.domain.Page<ExtractionJob> searchAdmin(@Param("status") String status, @Param("userId") Long userId,
                                                                   org.springframework.data.domain.Pageable pageable);

    /**
     * Dọn dẹp định kỳ: job bóc tách thường đã kết thúc quá lâu (extracted_text nặng); bộ thẻ đã tạo giữ nguyên.
     * Job của lộ trình (purpose = 'learning_path') không bị xoá ở đây (LP-1): bản nháp cần item để kích hoạt, lộ trình đang học cần
     * số từ vựng / ngữ pháp từng chương; chúng chỉ bị xoá trắng extracted_text qua {@link #clearTextOfOldPathJobs}, còn job lộ trình
     * mồ côi đi qua {@link #deleteOrphanPathJobsBefore}.
     */
    @Modifying
    @Query("DELETE FROM ExtractionJob j WHERE j.status IN ('DONE','FAILED','CANCELLED') AND j.createdAt < :before "
            + "AND j.purpose <> 'learning_path'")
    int deleteFinishedBefore(@Param("before") java.time.Instant before);

    /**
     * LP-10: xoá lộ trình GIỮ dòng job (CANCELLED, extracted_text NULL) để lượt hạn mức 24 giờ — đếm theo số dòng job — không bị
     * hoàn lại. Quá 90 ngày dòng mồ côi ấy không còn vai trò gì → xoá như job thường. Job còn lộ trình trỏ tới (kể cả FAILED chờ
     * "Chạy lại") không bao giờ bị xoá.
     */
    @Modifying
    @Query("DELETE FROM ExtractionJob j WHERE j.purpose = 'learning_path' AND j.status IN ('DONE','FAILED','CANCELLED') "
            + "AND j.createdAt < :before AND NOT EXISTS (SELECT 1 FROM LearningPath p WHERE p.jobId = j.id)")
    int deleteOrphanPathJobsBefore(@Param("before") Instant before);

    /**
     * LP-1: job lộ trình đã kết thúc, tạo trước :before (cùng mốc với {@link #deleteFinishedBefore}) và lộ trình đã ACTIVE
     * -> xoá trắng extracted_text (phần nặng nhất), item / stats giữ lại. DRAFT và FAILED giữ văn bản để còn kích hoạt
     * hoặc chạy lại. Trả số job thực sự bị xoá trắng (job đã NULL không đếm lại).
     */
    @Modifying
    @Query("UPDATE ExtractionJob j SET j.extractedText = NULL WHERE j.purpose = 'learning_path' "
            + "AND j.status IN ('DONE','FAILED','CANCELLED') AND j.createdAt < :before AND j.extractedText IS NOT NULL "
            + "AND EXISTS (SELECT 1 FROM LearningPath p WHERE p.jobId = j.id AND p.status = 'ACTIVE')")
    int clearTextOfOldPathJobs(@Param("before") Instant before);

    /**
     * Khoá tư vấn theo giao dịch cho hạn mức bóc tách của một người dùng (rà soát 25/10, D4): đếm job 24 giờ rồi mới lưu job mới
     * là hai bước — N request song song cùng thấy "còn 1 lượt" và cùng lọt. Khoá xếp chúng thành hàng. Dạng hai khoá int (không
     * đụng không gian khoá bigint của QuizAttemptRepository.lockCreate); namespace 1 = hạn mức bóc tách.
     */
    @Query(value = "SELECT CAST(pg_advisory_xact_lock(1, CAST(:uid AS int)) AS text)", nativeQuery = true)
    String lockQuota(@Param("uid") Long uid);

    /**
     * Nhận job để chạy lại (rà soát 25/10, D5): chỉ job đã kết thúc mới chuyển được sang QUEUED, trong MỘT câu UPDATE. Hai lần bấm
     * "Chạy lại" song song: lần sau nhận 0 dòng -> 409, không có hai worker cùng chạy một job (tốn Gemini gấp đôi, item trùng).
     */
    @Transactional
    @Modifying
    @Query("UPDATE ExtractionJob j SET j.status = 'QUEUED', j.stage = 'QUEUED' "
            + "WHERE j.id = :id AND j.status IN ('DONE','FAILED','CANCELLED')")
    int claimIdle(@Param("id") UUID id);

    /**
     * Backend khởi động lại: worker trong RAM đã mất -> job dở dang coi như thất bại. B8: chỉ job của chính instance này, hoặc job
     * chưa ghi instance (trước V37) tạo trước {@code cutoff} (30 phút) — job của instance khác đang chạy không bị đụng.
     */
    @Modifying
    @Query("UPDATE ExtractionJob j SET j.status = 'FAILED', j.errorMessage = :message, j.finishedAt = :now "
            + "WHERE j.status IN ('QUEUED', 'RUNNING') "
            + "AND (j.instanceId = :instance OR (j.instanceId IS NULL AND j.createdAt < :cutoff))")
    int failUnfinished(@Param("message") String message, @Param("now") Instant now, @Param("instance") String instance,
                       @Param("cutoff") Instant cutoff);

    /**
     * Kích hoạt lộ trình ghi deck_ids bằng UPDATE đúng một cột thay vì sửa entity đã nạp: giao dịch kích hoạt dài (thư mục, bộ
     * thẻ, lịch) mà flush entity là UPDATE cả dòng (không @DynamicUpdate) mang theo status / stage / stats đọc lúc đầu — worker
     * "Dịch lại nghĩa" vừa ghi DONE / enrichedAt ở giữa sẽ bị ghi đè thành RUNNING vĩnh viễn. :ids là JSON mảng chuỗi.
     */
    @Modifying
    @Query(value = "UPDATE extraction_jobs SET deck_ids = CAST(:ids AS jsonb) WHERE id = :id", nativeQuery = true)
    int setDeckIds(@Param("id") UUID id, @Param("ids") String idsJson);
}
