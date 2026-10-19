package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.KanjiMnemonic;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface KanjiMnemonicRepository extends JpaRepository<KanjiMnemonic, UUID> {

    long countByStatus(String status);

    /** Mẹo công khai của một lô chữ (partial unique index: tối đa một mẹo APPROVED mỗi chữ). */
    List<KanjiMnemonic> findByKanjiInAndStatus(Collection<String> kanji, String status);

    Optional<KanjiMnemonic> findByKanjiAndStatus(String kanji, String status);

    /** Mẹo của chính mình cho một chữ, mới nhất trước (mọi trạng thái: người học xem được lý do bị từ chối). */
    List<KanjiMnemonic> findByCreatedByAndKanjiOrderByCreatedAtDescIdAsc(Long createdBy, String kanji);

    long countByCreatedByAndKanjiAndStatus(Long createdBy, String kanji, String status);

    /** Tổng mẹo của một người ở một trạng thái (trần mẹo PENDING mỗi người: chặn làm ngập hàng chờ duyệt). */
    long countByCreatedByAndStatus(Long createdBy, String status);

    /** Chữ (trong lô) mà người này đã có mẹo đang chờ duyệt: sinh mẹo bỏ qua các chữ đó. */
    @Query("SELECT DISTINCT m.kanji FROM KanjiMnemonic m WHERE m.createdBy = :uid AND m.status = 'PENDING' AND m.kanji IN :kanji")
    List<String> pendingKanjiOf(@Param("uid") Long uid, @Param("kanji") Collection<String> kanji);

    /** Số bộ đã biết của chữ (từ một mẹo sinh bởi ai-service) để mẹo người học tự viết cũng có bộ trong hàng chờ duyệt. */
    Optional<KanjiMnemonic> findFirstByKanjiAndRadicalNoIsNotNullOrderByCreatedAtDesc(String kanji);

    /**
     * Hàng chờ duyệt của admin: q đã lower + escape bằng AdminUserService.likePattern (rỗng = không lọc), khớp chữ, nội dung mẹo
     * hoặc email tác giả.
     */
    @Query(value = "SELECT m FROM KanjiMnemonic m LEFT JOIN User u ON u.id = m.createdBy WHERE m.status = :status "
            + "AND (:q = '' OR lower(m.kanji) LIKE :q ESCAPE '!' OR lower(m.mnemonicVi) LIKE :q ESCAPE '!' "
            + "OR lower(u.email) LIKE :q ESCAPE '!') ORDER BY m.createdAt DESC, m.id DESC",
            countQuery = "SELECT count(m) FROM KanjiMnemonic m LEFT JOIN User u ON u.id = m.createdBy WHERE m.status = :status "
                    + "AND (:q = '' OR lower(m.kanji) LIKE :q ESCAPE '!' OR lower(m.mnemonicVi) LIKE :q ESCAPE '!' "
                    + "OR lower(u.email) LIKE :q ESCAPE '!')")
    Page<KanjiMnemonic> search(@Param("status") String status, @Param("q") String q, Pageable pageable);

    /** Sửa nội dung chỉ khi còn PENDING: 0 = không tồn tại hoặc đã được xử lý. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE KanjiMnemonic m SET m.mnemonicVi = :text WHERE m.id = :id AND m.status = 'PENDING'")
    int editPending(@Param("id") UUID id, @Param("text") String text);

    /** Duyệt / từ chối chỉ khi còn PENDING (một câu UPDATE): hai admin cùng xử lý thì người sau nhận 0. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE KanjiMnemonic m SET m.status = :status, m.reviewNote = :note, m.reviewedBy = :by, m.reviewedAt = :at "
            + "WHERE m.id = :id AND m.status = 'PENDING'")
    int reviewPending(@Param("id") UUID id, @Param("status") String status, @Param("note") String note,
                      @Param("by") Long by, @Param("at") Instant at);

    /** Hạ mẹo APPROVED cũ của chữ xuống REJECTED khi duyệt mẹo mới (cùng transaction với lệnh duyệt). */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE KanjiMnemonic m SET m.status = 'REJECTED', m.reviewNote = :note, m.reviewedBy = :by, m.reviewedAt = :at "
            + "WHERE m.id = :id AND m.status = 'APPROVED'")
    int retireApproved(@Param("id") UUID id, @Param("note") String note, @Param("by") Long by, @Param("at") Instant at);
}
