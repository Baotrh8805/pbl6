package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.model.Notification;
import com.pbl6.flashcard.repository.LearningPathRepository;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Nhắc học (spec §4.4, IT-07): job chạy mỗi giờ, gửi từ giờ cấu hình learning_path_reminder_hour (Asia/Ho_Chi_Minh) và chạy bù
 * các giờ sau trong ngày, tối đa một LEARNING_PATH_REMINDER / lộ trình / ngày, bỏ qua lộ trình tắt nhắc, không có việc, chưa tới
 * ngày học 1 hoặc đang ngày nghỉ. Gọi thẳng run(now, today) với mốc giờ cố định (cron thật tắt ở profile test).
 * <p>Giờ nhắc đặt 9 cho cả lớp (khác seed 7) để chứng minh job đọc cấu hình mỗi lượt; giá trị cũ được trả lại sau mỗi test.
 * DB dùng chung với các IT khác cùng context: lộ trình của test khác cũng là ứng viên của job. Trước mỗi lượt chạy cần đếm
 * chính xác, test đánh dấu mọi lộ trình của người dùng KHÁC là "đã xét" ngày đó ({@link #onlyUser}) — không chạy job trước cho
 * nhiều ngày được, vì last_reminded_on chỉ giữ một ngày: chạy cho ngày sau ghi đè dấu của ngày trước.
 */
class LearningPathReminderJobIT extends IntegrationTest {

    private static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final String BASE = "/api/learning-paths/";
    private static final int H = 9;

    @Autowired
    LearningPathReminderJob job;

    @Autowired
    LearningPathRepository pathRepo;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    PlatformTransactionManager txm;

    /** B4: SMTP giả — MailService thật thấy có bean nên coi là đã cấu hình; bắt thư để kiểm người nhận / nội dung. */
    @MockitoBean
    JavaMailSender mailSender;

    private String savedHour;

    @BeforeEach
    void setHour() {
        savedHour = jdbc.queryForObject("SELECT value FROM app_settings WHERE key = ?", String.class,
                SettingsService.KEY_LP_REMINDER_HOUR);
        jdbc.update("UPDATE app_settings SET value = ? WHERE key = ?", String.valueOf(H), SettingsService.KEY_LP_REMINDER_HOUR);
    }

    @AfterEach
    void restoreHour() {
        jdbc.update("UPDATE app_settings SET value = ? WHERE key = ?", savedHour, SettingsService.KEY_LP_REMINDER_HOUR);
    }

    /** Phút 05 của giờ h ngày day theo múi giờ của job (như cron "0 5 * * * *"). */
    private static Instant at(LocalDate day, int h) {
        return day.atTime(h, 5).atZone(ZONE).toInstant();
    }

    /** Lộ trình bổ khuyết ACTIVE bắt đầu ngày start: 8 thẻ yếu (3 lần "again") của một bộ riêng, gom theo cấp. */
    private JsonNode remedialPath(String token, LocalDate start, int days) throws Exception {
        List<Map<String, Object>> cards = new ArrayList<>();
        for (String t : List.of("水", "火", "金", "木", "土", "日", "月", "山")) {
            Map<String, Object> c = new HashMap<>();
            c.put("term", t + "曜");
            c.put("meaning", "nghĩa " + t);
            c.put("level", "N5");
            cards.add(c);
        }
        JsonNode deck = read(call(post("/api/decks"), token, Map.of("title", "Yếu", "level", "N5", "cards", cards))
                .andExpect(status().isCreated()));
        for (JsonNode c : deck.get("cards")) {
            for (int i = 0; i < 3; i++) {
                call(post("/api/reviews"), token, Map.of("cardId", c.get("id").asText(), "grade", "again"))
                        .andExpect(status().isOk());
            }
        }
        return read(call(post(BASE + "remedial").param("date", start.toString()), token,
                Map.of("days", days, "groupBy", "level")).andExpect(status().isCreated()));
    }

    /** Lộ trình ACTIVE không có thẻ nào (chèn thẳng): luôn "không có việc". */
    private LearningPath emptyActive(Long uid, LocalDate start) {
        LearningPath p = new LearningPath();
        p.setId(UUID.randomUUID());
        p.setUserId(uid);
        p.setTitle("Trống");
        p.setSourceType(LearningPath.SOURCE_REMEDIAL);
        p.setStatus(LearningPath.ACTIVE);
        p.setTotalDays(5);
        p.setStartDate(start);
        p.setCreatedAt(Instant.now());
        p.setActivatedAt(Instant.now());
        return pathRepo.save(p);
    }

    private List<JsonNode> reminders(String token) throws Exception {
        List<JsonNode> out = new ArrayList<>();
        JsonNode items = read(call(get("/api/notifications"), token, null).andExpect(status().isOk())).get("items");
        for (JsonNode n : items) if (Notification.LEARNING_PATH_REMINDER.equals(n.get("type").asText())) out.add(n);
        return out;
    }

    private static JsonNode payloadOfDay(List<JsonNode> notes, int dayIndex) {
        for (JsonNode n : notes) if (n.get("payload").get("dayIndex").asInt() == dayIndex) return n.get("payload");
        throw new AssertionError("không có nhắc cho ngày " + dayIndex + ": " + notes);
    }

    private int totalReminders() {
        return jdbc.queryForObject("SELECT count(*) FROM notifications WHERE type = ?", Integer.class,
                Notification.LEARNING_PATH_REMINDER);
    }

    private LocalDate lastReminded(String pathId) {
        return pathRepo.findById(UUID.fromString(pathId)).orElseThrow().getLastRemindedOn();
    }

    /** Lượt chạy ngày day chỉ còn ứng viên của uid: lộ trình của người khác coi như đã xét ngày đó. */
    private void onlyUser(LocalDate day, Long uid) {
        jdbc.update("UPDATE learning_paths SET last_reminded_on = ? WHERE user_id <> ?", day, uid);
    }

    @Test
    void reminds_once_per_path_per_day_from_configured_hour_and_skips_muted_idle_or_unstarted_paths() throws Exception { // IT-07
        LocalDate day1 = LocalDate.of(2031, 3, 3);
        LocalDate day2 = day1.plusDays(1);
        LocalDate day4 = day1.plusDays(3);

        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        JsonNode on = remedialPath(token, day1, 3);
        String onId = on.get("id").asText();
        int day1New = on.get("today").get("newCount").asInt();
        assertTrue(day1New > 0, on.toString());
        JsonNode muted = remedialPath(token, day1, 3);
        String mutedId = muted.get("id").asText();
        assertTrue(muted.get("today").get("newCount").asInt() > 0, "lộ trình tắt nhắc cũng có việc hôm nay");
        JsonNode patched = read(call(patch(BASE + mutedId), token, Map.of("reminder", false)).andExpect(status().isOk()));
        assertFalse(patched.get("reminder").asBoolean());
        String idleId = emptyActive(uid, day1).getId().toString();
        // Bắt đầu sau 2 ngày: day1 là "before" — có thẻ xếp lịch nhưng chưa tới ngày học 1
        String laterId = remedialPath(token, day1.plusDays(2), 3).get("id").asText();

        // 07:05 — giờ seed (7) nhưng cấu hình đang là 9: chưa tới giờ, không gửi, không đánh dấu
        onlyUser(day1, uid);
        assertEquals(0, job.run(at(day1, 7), day1));
        assertEquals(0, job.run(at(day1, H - 1), day1));
        assertEquals(0, reminders(token).size());
        assertNull(lastReminded(onId));
        assertNull(lastReminded(idleId));

        // 09:05: đúng một nhắc — cho lộ trình bật nhắc, có việc, đang trong kỳ học
        assertEquals(1, job.run(at(day1, H), day1));
        List<JsonNode> notes = reminders(token);
        assertEquals(1, notes.size(), notes.toString());
        JsonNode p1 = notes.get(0).get("payload");
        assertEquals(onId, p1.get("pathId").asText());
        assertEquals(on.get("title").asText(), p1.get("title").asText());
        assertEquals(1, p1.get("dayIndex").asInt());
        assertEquals(3, p1.get("totalDays").asInt());
        assertEquals(day1New, p1.get("newCount").asInt());
        assertEquals(0, p1.get("dueCount").asInt());
        assertEquals(0, p1.get("behindCount").asInt());
        assertEquals(day1, lastReminded(onId));
        assertEquals(day1, lastReminded(idleId), "lộ trình không có việc vẫn được đánh dấu đã xét");
        assertEquals(day1, lastReminded(laterId), "chưa tới ngày học 1: im lặng nhưng đã xét");
        assertNull(lastReminded(mutedId), "tắt nhắc: không phải ứng viên");
        // Tắt nhắc thì cũng không giành được lượt (UPDATE có điều kiện xét lại reminder lúc ghi)
        TransactionTemplate tx = new TransactionTemplate(txm);
        Integer claimed = tx.execute(s -> pathRepo.claimReminder(UUID.fromString(mutedId), day1));
        assertEquals(0, claimed);
        assertNull(lastReminded(mutedId));

        // Chạy lại cùng ngày (khởi động lại giữa giờ, chạy tay, giờ sau chạy bù): không nhắc trùng
        assertEquals(0, job.run(at(day1, H), day1));
        assertEquals(0, job.run(at(day1, H + 2), day1));
        assertEquals(1, reminders(token).size());

        // Ngày 2, lượt 09:05 bị lỡ (server tắt): lượt 13:05 chạy bù. Thẻ ngày 1 chưa học thành nợ -> nhắc kèm behindCount
        onlyUser(day2, uid);
        int before = totalReminders();
        int sent = job.run(at(day2, 13), day2);
        assertEquals(1, sent, "chỉ lộ trình bật nhắc; lộ trình bắt đầu muộn vẫn 'before'");
        assertEquals(totalReminders() - before, sent, "run trả đúng số thông báo đã gửi");
        notes = reminders(token);
        JsonNode p2 = payloadOfDay(notes, 2);
        assertEquals(onId, p2.get("pathId").asText());
        assertEquals(day1New, p2.get("behindCount").asInt());
        assertEquals(day2, lastReminded(laterId), "day2 vẫn 'before'");
        int afterDay2 = notes.size();
        assertEquals(2, afterDay2, notes.toString());
        assertEquals(0, job.run(at(day2, 14), day2));
        assertEquals(2, reminders(token).size());

        // Qua ngày cuối (state after) mà còn thẻ chưa học: vẫn nhắc; lộ trình bắt đầu muộn đang ở ngày 2 -> cũng được nhắc
        onlyUser(day4, uid);
        before = totalReminders();
        sent = job.run(at(day4, H), day4);
        assertEquals(2, sent);
        assertEquals(totalReminders() - before, sent);
        notes = reminders(token);
        assertEquals(4, notes.size(), notes.toString());
        JsonNode p4 = null;
        JsonNode pLater = null;
        for (JsonNode n : notes) {
            JsonNode p = n.get("payload");
            if (p.get("dayIndex").asInt() == 4 && onId.equals(p.get("pathId").asText())) p4 = p;
            if (laterId.equals(p.get("pathId").asText())) pLater = p;
        }
        assertNotNull(p4, notes.toString());
        assertEquals(8, p4.get("behindCount").asInt(), "cả 8 thẻ chưa học đều là nợ");
        assertEquals(0, p4.get("newCount").asInt());
        assertNotNull(pLater, notes.toString());
        assertEquals(2, pLater.get("dayIndex").asInt());
        assertNull(lastReminded(mutedId));
    }

    @Test
    void rest_day_is_silent_even_with_due_cards_and_paths_activated_after_the_hour_wait_for_tomorrow() throws Exception {
        LocalDate monday = LocalDate.of(2032, 3, 1);
        LocalDate saturday = monday.plusDays(5);
        LocalDate nextMonday = monday.plusDays(7);
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        JsonNode path = remedialPath(token, monday, 5);
        String id = path.get("id").asText();
        call(patch(BASE + id).param("date", monday.toString()), token, Map.of("studyDays", "1111100"))
                .andExpect(status().isOk());
        // Học một thẻ (clone) của lộ trình: hạn ôn của nó (thời gian thật + khoảng ôn) đã qua từ lâu vào năm 2032 -> đến hạn
        String deckId = path.get("chapters").get(0).get("deckId").asText();
        String cardId = read(call(get("/api/decks/" + deckId), token, null).andExpect(status().isOk()))
                .get("cards").get(0).get("id").asText();
        call(post("/api/reviews"), token, Map.of("cardId", cardId, "grade", "good", "pathId", id)).andExpect(status().isOk());

        JsonNode sat = read(call(get(BASE + id).param("date", saturday.toString()), token, null).andExpect(status().isOk()));
        assertEquals("rest", sat.get("today").get("state").asText(), sat.get("today").toString());
        assertEquals(1, sat.get("today").get("dueCount").asInt());
        assertTrue(sat.get("today").get("behindCount").asInt() > 0);

        // Thứ Bảy là ngày nghỉ theo lịch: không nhắc dù có thẻ đến hạn + nợ, nhưng đã xét
        onlyUser(saturday, uid);
        assertEquals(0, job.run(at(saturday, H), saturday));
        assertEquals(0, reminders(token).size());
        assertEquals(saturday, lastReminded(id));

        // Thứ Hai tuần sau: qua ngày cuối (after) -> nhắc, kèm thẻ đến hạn và nợ
        onlyUser(nextMonday, uid);
        assertEquals(1, job.run(at(nextMonday, H), nextMonday));
        JsonNode p = reminders(token).get(0).get("payload");
        assertEquals(id, p.get("pathId").asText());
        assertEquals(1, p.get("dueCount").asInt());
        assertEquals(7, p.get("behindCount").asInt());

    }

    @Test
    void path_activated_after_the_hour_is_reminded_from_the_next_day() throws Exception {
        LocalDate wednesday = LocalDate.of(2032, 3, 10);
        LocalDate thursday = wednesday.plusDays(1);
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        String id = remedialPath(token, wednesday, 3).get("id").asText();
        // Kích hoạt lúc 10:00 thứ Tư (sau giờ nhắc 9:00): người dùng đang nhìn lộ trình, lượt chạy bù 11:05 không nhắc ngay
        jdbc.update("UPDATE learning_paths SET activated_at = ? WHERE id = ?",
                java.sql.Timestamp.from(wednesday.atTime(10, 0).atZone(ZONE).toInstant()), UUID.fromString(id));
        onlyUser(wednesday, uid);
        assertEquals(0, job.run(at(wednesday, 11), wednesday));
        assertNull(lastReminded(id), "kích hoạt sau giờ nhắc: chưa phải ứng viên hôm đó");
        assertEquals(0, reminders(token).size());

        // Thứ Năm 09:05: nhắc bình thường (ngày 2, thẻ ngày 1 chưa học thành nợ)
        onlyUser(thursday, uid);
        assertEquals(1, job.run(at(thursday, H), thursday));
        assertEquals(thursday, lastReminded(id));
        JsonNode p = reminders(token).get(0).get("payload");
        assertEquals(2, p.get("dayIndex").asInt());
        assertTrue(p.get("behindCount").asInt() > 0, p.toString());
    }

    @Test
    void email_reminder_is_opt_in_per_path_merged_per_user_once_a_day_and_skips_locked_accounts() throws Exception {
        LocalDate day1 = LocalDate.of(2033, 5, 2);
        String emailA = newEmail();
        String tokenA = newUser(emailA);
        Long uidA = userId(emailA);
        String p1 = remedialPath(tokenA, day1, 5).get("id").asText();
        String p2 = remedialPath(tokenA, day1, 5).get("id").asText();
        String emailB = newEmail();
        String tokenB = newUser(emailB);
        Long uidB = userId(emailB);
        String pb = remedialPath(tokenB, day1, 5).get("id").asText();
        String emailC = newEmail();
        String tokenC = newUser(emailC);
        Long uidC = userId(emailC);
        String pc = remedialPath(tokenC, day1, 5).get("id").asText();

        // mặc định tắt; bật qua PATCH (A: cả hai lộ trình, B: không bật, C: bật nhưng tài khoản bị khoá)
        assertFalse(read(call(get(BASE + p1), tokenA, null)).get("remindEmail").asBoolean());
        for (String[] t : new String[][] {{p1, tokenA}, {p2, tokenA}, {pc, tokenC}}) {
            JsonNode r = read(call(patch(BASE + t[0]), t[1], Map.of("remindEmail", true)).andExpect(status().isOk()));
            assertTrue(r.get("remindEmail").asBoolean());
        }
        jdbc.update("UPDATE users SET locked_at = now() WHERE id = ?", uidC);
        jdbc.update("UPDATE learning_paths SET last_reminded_on = ? WHERE user_id NOT IN (?, ?, ?)", day1, uidA, uidB, uidC);
        clearInvocations(mailSender);

        assertEquals(4, job.run(at(day1, H), day1), "thông báo trong app không đổi: A 2, B 1, C 1");
        ArgumentCaptor<SimpleMailMessage> sent = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, times(1)).send(sent.capture());
        SimpleMailMessage m = sent.getValue();
        assertArrayEquals(new String[] {emailA}, m.getTo());
        assertTrue(m.getSubject().contains("trong 2 lộ trình"), m.getSubject());
        assertTrue(m.getText().contains("/roadmap/" + p1) && m.getText().contains("/roadmap/" + p2), m.getText());
        assertTrue(m.getText().contains("thẻ mới"), m.getText());

        // chạy lại cùng ngày (lượt bù): không gửi thêm
        clearInvocations(mailSender);
        assertEquals(0, job.run(at(day1, H + 3), day1));
        verify(mailSender, never()).send(any(SimpleMailMessage.class));

        // tắt email ở một lộ trình: hôm sau chỉ còn lộ trình kia trong thư
        LocalDate day2 = day1.plusDays(1);
        call(patch(BASE + p2), tokenA, Map.of("remindEmail", false)).andExpect(status().isOk());
        onlyUser(day2, uidA);
        job.run(at(day2, H), day2);
        verify(mailSender, times(1)).send(sent.capture());
        assertTrue(sent.getValue().getText().contains("/roadmap/" + p1));
        assertFalse(sent.getValue().getText().contains("/roadmap/" + p2), sent.getValue().getText());
        assertEquals(1, reminders(tokenB).size(), "B vẫn nhận nhắc trong app ngày 1");
    }
}
