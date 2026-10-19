package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.EmailVerificationToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface EmailVerificationTokenRepository extends JpaRepository<EmailVerificationToken, Long> {

    Optional<EmailVerificationToken> findByTokenHash(String tokenHash);

    /** Xác thực xong / gửi lại link / admin xác thực hộ: mọi link cũ của user hết hiệu lực. */
    @Modifying
    @Query("DELETE FROM EmailVerificationToken t WHERE t.userId = :uid")
    void deleteByUserId(@Param("uid") Long uid);

    /** Dọn dẹp định kỳ (HousekeepingJob). */
    @Modifying
    @Query("DELETE FROM EmailVerificationToken t WHERE t.expiresAt <= :now")
    int deleteExpired(@Param("now") java.time.Instant now);
}
