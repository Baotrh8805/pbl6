package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
    Boolean existsByEmail(String email);

    /** Admin Panel: q đã lower + escape (rỗng = không lọc); role/premium/locked null = không lọc. */
    @Query("SELECT u FROM User u WHERE (:q = '' OR lower(u.email) LIKE :q ESCAPE '!' OR lower(u.fullName) LIKE :q ESCAPE '!') "
            + "AND (:role IS NULL OR u.role = :role) "
            + "AND (:premium IS NULL OR u.isPremium = :premium) "
            + "AND (:locked IS NULL OR (CASE WHEN u.lockedAt IS NULL THEN false ELSE true END) = :locked) "
            + "ORDER BY u.createdAt DESC, u.id DESC")
    Page<User> search(@Param("q") String q, @Param("role") Role role, @Param("premium") Boolean premium,
                      @Param("locked") Boolean locked, Pageable pageable);

    @Query(value = "SELECT max(reviewed_at) FROM review_logs WHERE user_id = :uid", nativeQuery = true)
    Instant lastReviewAt(@Param("uid") Long uid);

    // ---------- dashboard admin ----------

    long countByCreatedAtAfter(java.time.LocalDateTime since);

    long countByLockedAtIsNotNull();

    long countByIsPremiumTrue();

    /** Người có ít nhất một lượt ôn từ mốc `since` (đếm distinct). */
    @Query(value = "SELECT count(DISTINCT user_id) FROM review_logs WHERE reviewed_at >= :since", nativeQuery = true)
    long countActiveSince(@Param("since") Instant since);

    /** users.created_at là timestamp không múi giờ (ghi theo giờ JVM) -> lấy ngày như đã lưu. */
    @Query(value = "SELECT CAST(created_at AS date) AS day, count(*) AS n FROM users WHERE created_at >= :since GROUP BY day",
            nativeQuery = true)
    java.util.List<DayCount> countByDay(@Param("since") java.time.LocalDateTime since);
}
