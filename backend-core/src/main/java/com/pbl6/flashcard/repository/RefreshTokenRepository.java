package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    long countByUserIdAndExpiresAtAfter(Long userId, Instant now);

    /** Đăng xuất: chỉ thu hồi phiên hiện tại. */
    @Modifying
    @Query("DELETE FROM RefreshToken t WHERE t.tokenHash = :hash")
    void deleteByTokenHash(@Param("hash") String hash);

    /** Đổi / đặt lại mật khẩu: mọi phiên của user bị thu hồi. */
    @Modifying
    @Query("DELETE FROM RefreshToken t WHERE t.userId = :uid")
    void deleteByUserId(@Param("uid") Long uid);

    /** Dọn phiên đã hết hạn của user mỗi lần đăng nhập để bảng không phình. */
    @Modifying
    @Query("DELETE FROM RefreshToken t WHERE t.userId = :uid AND t.expiresAt <= :now")
    void deleteExpiredByUserId(@Param("uid") Long uid, @Param("now") Instant now);

    /** Dọn dẹp định kỳ (HousekeepingJob). */
    @Modifying
    @Query("DELETE FROM RefreshToken t WHERE t.expiresAt <= :now")
    int deleteExpired(@Param("now") Instant now);
}
