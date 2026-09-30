package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    /** Đặt lại xong / xin link mới: mọi link cũ của user hết hiệu lực. */
    @Modifying
    @Query("DELETE FROM PasswordResetToken t WHERE t.userId = :uid")
    void deleteByUserId(@Param("uid") Long uid);
}
