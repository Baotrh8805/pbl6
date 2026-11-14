package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.AppSetting;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppSettingRepository extends JpaRepository<AppSetting, String> {
}
