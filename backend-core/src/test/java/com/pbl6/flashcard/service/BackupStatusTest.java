package com.pbl6.flashcard.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Duration;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** G2/B4: trạng thái sao lưu từ mtime của file LAST_OK. */
class BackupStatusTest {

    @Test
    void states(@TempDir Path dir) throws Exception {
        Instant now = Instant.parse("2026-10-18T12:00:00Z");
        Path marker = dir.resolve("LAST_OK");
        assertEquals("unmonitored", AdminStatsService.backupStatus(null, now));
        assertEquals("missing", AdminStatsService.backupStatus(marker, now));
        Files.writeString(marker, "2026-10-18T11:00:00Z");
        Files.setLastModifiedTime(marker, FileTime.from(now.minus(Duration.ofHours(1))));
        assertEquals("ok", AdminStatsService.backupStatus(marker, now));
        Files.setLastModifiedTime(marker, FileTime.from(now.minus(Duration.ofHours(49))));
        assertEquals("stale", AdminStatsService.backupStatus(marker, now));
    }
}
