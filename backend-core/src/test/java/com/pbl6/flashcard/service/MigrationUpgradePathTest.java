package com.pbl6.flashcard.service;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Đường nâng cấp thật: DB đang ở V7 có dữ liệu cũ (thẻ có "ví dụ", lượt quiz đang mở) -> lên bản mới nhất.
 * Test tích hợp thường chỉ chạy migration trên DB rỗng nên không phủ được UPDATE gộp dữ liệu của V8/V9.
 */
class MigrationUpgradePathTest {

    @Test
    void existing_cards_keep_every_character_and_open_legacy_attempts_are_closed() throws Exception {
        try (EmbeddedPostgres pg = EmbeddedPostgres.builder().start()) {
            DataSource ds = pg.getPostgresDatabase();
            Flyway.configure().dataSource(ds).locations("classpath:db/migration").target("7").load().migrate();

            try (Connection c = ds.getConnection(); Statement s = c.createStatement()) {
                s.execute("INSERT INTO users (email, password_hash, full_name, role, jlpt_level, is_premium, created_at) "
                        + "VALUES ('u@x.com', '!', 'U', 'USER', 'N5', false, now())");
                s.execute("INSERT INTO decks (id, title, level, owner_id) VALUES ('d1', 'D', 'N5', (SELECT id FROM users WHERE email='u@x.com'))");
                s.execute("INSERT INTO flashcards (id, deck_id, term, reading, meaning, example, position) VALUES "
                        + "('c1','d1','水','みず','nước','水を飲む。',1),"
                        + "('c2','d1','火',NULL,'lửa',NULL,2),"
                        + "('c3','d1','木',NULL,'cây','   ',3),"
                        + "('c4','d1','山',NULL,'núi','山に登る。\nGhi chú',4)");
                // Lượt quiz đang mở theo mô hình cũ (không có bản chụp đề)
                s.execute("INSERT INTO quiz_attempts (id, user_id, deck_id, card_ids, created_at, expires_at) VALUES "
                        + "('11111111-1111-1111-1111-111111111111', (SELECT id FROM users WHERE email='u@x.com'), 'd1', 'c1\nc2', now(), now() + interval '1 hour')");
                s.execute("INSERT INTO quiz_results (user_id, deck_id, score, total, created_at) VALUES "
                        + "((SELECT id FROM users WHERE email='u@x.com'), 'd1', 3, 4, now())");
            }

            Flyway.configure().dataSource(ds).locations("classpath:db/migration").load().migrate();

            try (Connection c = ds.getConnection(); Statement s = c.createStatement()) {
                assertEquals("nước\n\n水を飲む。", one(s, "SELECT meaning FROM flashcards WHERE id='c1'"), "ví dụ nối sau một dòng trống");
                assertEquals("lửa", one(s, "SELECT meaning FROM flashcards WHERE id='c2'"), "không ví dụ: giữ nguyên");
                assertEquals("cây", one(s, "SELECT meaning FROM flashcards WHERE id='c3'"), "ví dụ chỉ có khoảng trắng: bỏ");
                assertEquals("núi\n\n山に登る。\nGhi chú", one(s, "SELECT meaning FROM flashcards WHERE id='c4'"), "ví dụ nhiều dòng giữ nguyên");
                try (ResultSet rs = s.executeQuery("SELECT count(*) FROM information_schema.columns WHERE table_name='flashcards' AND column_name='example'")) {
                    rs.next();
                    assertEquals(0, rs.getInt(1), "cột example đã bị xoá");
                }
                assertNotNull(one(s, "SELECT submitted_at::text FROM quiz_attempts WHERE id='11111111-1111-1111-1111-111111111111'"),
                        "lượt cũ còn mở được đóng để áp unique index");
                assertEquals("exam", one(s, "SELECT mode FROM quiz_results LIMIT 1"), "kết quả cũ mặc định là exam");
                // Seed thư viện chạy được sau khi cột example biến mất (repeatable migration)
                assertTrue(Integer.parseInt(one(s, "SELECT count(*) FROM flashcards WHERE deck_id = 'n5-core'")) > 0);
            }
        }
    }

    private static String one(Statement s, String sql) throws Exception {
        try (ResultSet rs = s.executeQuery(sql)) {
            assertTrue(rs.next(), sql);
            return rs.getString(1);
        }
    }
}
