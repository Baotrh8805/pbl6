package com.pbl6.flashcard.config;

import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.flyway.FlywayConfigurationCustomizer;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Cho Flyway một kết nối riêng khi app.migration.url có giá trị. Không khai báo DataSource bean thứ hai
 * (sẽ làm DataSource chính của app bị thay thế), chỉ đổi nguồn kết nối của riêng Flyway.
 */
@Configuration
public class MigrationConfig {

    @Bean
    public FlywayConfigurationCustomizer migrationConnection(
            @Value("${app.migration.url:}") String url,
            @Value("${spring.datasource.username:}") String username,
            @Value("${spring.datasource.password:}") String password) {
        return configuration -> {
            if (!url.isBlank()) {
                configuration.dataSource(url, username, password);
            }
        };
    }

    /**
     * Tự động repair checksum nếu migration script có thay đổi nhỏ sau khi đã apply vào DB dev.
     */
    @Bean
    public FlywayMigrationStrategy flywayMigrationStrategy() {
        return flyway -> {
            flyway.repair();
            flyway.migrate();
        };
    }
}
