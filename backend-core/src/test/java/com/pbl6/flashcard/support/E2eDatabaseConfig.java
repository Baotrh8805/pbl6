package com.pbl6.flashcard.support;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.util.FileSystemUtils;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.file.Path;

/** Chỉ cho profile e2e: smoke test chạy trên Postgres nhúng, không ghi rác vào Supabase. */
@Configuration
@Profile("e2e")
public class E2eDatabaseConfig {

    /** Tên thư mục cố định để e2e.mjs nhận ra và dọn postgres.exe mồ côi (taskkill /F bỏ qua close()). */
    public static final String DATA_DIR_NAME = "pbl6-e2e-pg";

    @Bean(destroyMethod = "close")
    public EmbeddedPostgres embeddedPostgres() throws IOException {
        Path dataDir = Path.of(System.getProperty("java.io.tmpdir"), DATA_DIR_NAME);
        // Lần chạy trước bị kill cứng thì thư mục còn lại -> initdb từ chối. e2e.mjs đã dọn postgres.exe cũ.
        FileSystemUtils.deleteRecursively(dataDir);
        return EmbeddedPostgres.builder()
                .setDataDirectory(dataDir)
                .setCleanDataDirectory(true)
                .start();
    }

    @Bean
    public DataSource dataSource(EmbeddedPostgres postgres) {
        return postgres.getPostgresDatabase();
    }
}
