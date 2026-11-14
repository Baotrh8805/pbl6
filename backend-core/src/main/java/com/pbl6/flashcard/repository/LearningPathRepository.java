package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.LearningPath;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface LearningPathRepository extends JpaRepository<LearningPath, UUID> {

    Optional<LearningPath> findByIdAndUserId(UUID id, Long userId);

    /**
     * LP-13: khoá dòng lộ trình (SELECT ... FOR UPDATE) cho MỌI thao tác ghi. Hai request song song (bấm "Kích hoạt" hai lần,
     * PATCH trong lúc cân lại lịch) xếp hàng: request sau chỉ đọc được dòng sau khi request trước commit nên thấy trạng thái mới
     * (ACTIVE → 409) thay vì tạo thêm thư mục + bộ thẻ. Rỗng khi không phải của người dùng → caller trả 404 như findByIdAndUserId.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM LearningPath p WHERE p.id = :id AND p.userId = :uid")
    Optional<LearningPath> lockByIdAndUserId(@Param("id") UUID id, @Param("uid") Long uid);

    List<LearningPath> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<LearningPath> findByUserIdAndStatusOrderByCreatedAtDesc(Long userId, String status);

    Optional<LearningPath> findByJobId(UUID jobId);

    /** ReviewService: pathId client gửi kèm lượt ôn chỉ được ghi vào review_logs khi là lộ trình của chính người đó. */
    boolean existsByIdAndUserId(UUID id, Long userId);

    // Thống kê admin (AdminStatsResponse.learningPathBreakdown): đếm thẳng ở DB, không bảng tổng hợp.
    long countByStatus(String status);

    /** ACTIVE chưa chốt hoàn thành = "đang học"; completed_at có giá trị = đã hoàn thành (vẫn status ACTIVE). */
    long countByStatusAndCompletedAtIsNull(String status);

    long countByCompletedAtIsNotNull();

    long countBySourceType(String sourceType);

    /**
     * Backend khởi động lại: worker trong RAM đã mất -> lộ trình đang xử lý coi như thất bại. Nạp từng dòng (không UPDATE hàng
     * loạt) để LearningPathService.fail gửi thông báo LEARNING_PATH_FAILED cho từng người — họ đã rời trang từ lâu.
     */
    List<LearningPath> findByStatus(String status);

    /** ExtractionService.deleteJob: job lộ trình còn lộ trình trỏ tới thì chỉ xoá qua lộ trình; mồ côi (CANCELLED sau khi xoá) thì xoá được. */
    boolean existsByJobId(UUID jobId);

    /**
     * LearningPathReminderJob: lộ trình đang học (ACTIVE, chưa chốt hoàn thành) có bật nhắc, chưa được xét trong ngày today và
     * đã kích hoạt trước giờ nhắc hôm nay (:activatedBefore) — lộ trình vừa tạo / kích hoạt sau giờ nhắc thì người dùng đang nhìn
     * nó, nhắc từ sáng hôm sau. Sắp theo người dùng để job gom "hôm nay" của mỗi người bằng một lượt batch; lộ trình đã chốt hoàn
     * thành không nhắc nữa dù còn thẻ đến hạn — người dùng đã khép lộ trình, nhắc tiếp là làm phiền. Chỉ để lấy danh sách: job
     * không sửa các entity này mà đánh dấu bằng {@link #claimReminder}.
     */
    @Query("SELECT p FROM LearningPath p WHERE p.status = 'ACTIVE' AND p.reminder = true AND p.completedAt IS NULL "
            + "AND (p.lastRemindedOn IS NULL OR p.lastRemindedOn <> :today) "
            + "AND (p.activatedAt IS NULL OR p.activatedAt < :activatedBefore) ORDER BY p.userId, p.createdAt DESC")
    List<LearningPath> findReminderCandidates(@Param("today") LocalDate today,
                                              @Param("activatedBefore") Instant activatedBefore);

    /** B4: trong các lộ trình vừa giành lượt nhắc, lộ trình nào bật nhắc qua email — đọc lại lúc gửi, không dùng bản nạp đầu lượt. */
    @Query("SELECT p.id FROM LearningPath p WHERE p.id IN :ids AND p.remindEmail = true")
    List<UUID> findRemindEmailIds(@Param("ids") java.util.Collection<UUID> ids);

    /**
     * Giành lượt nhắc hôm nay của một lộ trình: UPDATE có điều kiện chỉ ghi cột last_reminded_on (không ghi lại cả dòng từ bản
     * đọc cũ, nên không đè PATCH / complete chạy xen giữa) và chỉ khi lộ trình VẪN là ứng viên lúc ghi — Postgres xét lại WHERE
     * trên bản mới nhất nếu dòng vừa bị sửa, nên tắt nhắc / chốt hoàn thành / xoá ngay trước đó cho 0 dòng. Trả 1 = giành được
     * (gửi nhắc nếu có việc), 0 = đã xét rồi (lượt chạy khác, instance khác) hoặc không còn là ứng viên.
     */
    @Modifying
    @Query("UPDATE LearningPath p SET p.lastRemindedOn = :today WHERE p.id = :id AND p.status = 'ACTIVE' "
            + "AND p.reminder = true AND p.completedAt IS NULL AND (p.lastRemindedOn IS NULL OR p.lastRemindedOn <> :today)")
    int claimReminder(@Param("id") UUID id, @Param("today") LocalDate today);
}
