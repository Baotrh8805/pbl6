package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.admin.AdminStatsResponse;
import com.pbl6.flashcard.dto.admin.AdminStatsResponse.DayPoint;
import com.pbl6.flashcard.dto.admin.AdminStatsResponse.OcrPoint;
import com.pbl6.flashcard.model.Deck;
import com.pbl6.flashcard.model.ExtractionJob;
import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** Dashboard admin (UC-38): mọi con số tính thẳng ở DB, không bảng tổng hợp. */
@Service
public class AdminStatsService {

    private final UserRepository users;
    private final DeckRepository decks;
    private final FlashcardRepository cards;
    private final ExtractionJobRepository jobs;
    private final QuizAttemptRepository quizzes;
    private final LearningPathRepository paths;
    private final ReportService reports;
    private final AiServiceClient ai;
    private final QuestionBankService questionBank;
    private final MnemonicService mnemonics;
    private final AppealService appeals;
    private final com.pbl6.flashcard.service.dictionary.AdminDictionaryService dictionary;
    private final ZoneId zone;
    private final String version;
    private final String backupMarker;
    static final Duration BACKUP_STALE_AFTER = Duration.ofHours(48);

    public AdminStatsService(UserRepository users, DeckRepository decks, FlashcardRepository cards,
                             ExtractionJobRepository jobs, QuizAttemptRepository quizzes, LearningPathRepository paths,
                             ReportService reports, AiServiceClient ai, QuestionBankService questionBank,
                             MnemonicService mnemonics, AppealService appeals,
                             com.pbl6.flashcard.service.dictionary.AdminDictionaryService dictionary,
                             @Value("${app.learning-path.zone:Asia/Ho_Chi_Minh}") String zone,
                             @Value("${app.version:dev}") String version,
                             @Value("${app.backup.marker:}") String backupMarker) {
        this.users = users;
        this.decks = decks;
        this.cards = cards;
        this.jobs = jobs;
        this.quizzes = quizzes;
        this.paths = paths;
        this.reports = reports;
        this.ai = ai;
        this.questionBank = questionBank;
        this.mnemonics = mnemonics;
        this.dictionary = dictionary;
        this.appeals = appeals;
        this.zone = ZoneId.of(zone);
        this.version = version;
        this.backupMarker = backupMarker;
    }

    @Transactional(readOnly = true)
    public AdminStatsResponse stats(int days) {
        Instant now = Instant.now();
        LocalDate today = LocalDate.now(zone);
        LocalDate from = today.minusDays(days - 1L);
        Instant since = from.atStartOfDay(zone).toInstant();
        String zoneId = zone.getId();

        long[] newUsers = fill(byDay(users.countByDay(LocalDateTime.ofInstant(since, ZoneId.systemDefault()))), from, days);
        long[] extractions = fill(byDay(jobs.countByDay(since, zoneId)), from, days);
        long[] quizzesByDay = fill(byDay(quizzes.countByDay(since, zoneId)), from, days);
        List<DayPoint> series = new ArrayList<>(days);
        for (int i = 0; i < days; i++) {
            series.add(new DayPoint(from.plusDays(i), newUsers[i], extractions[i], quizzesByDay[i]));
        }

        return new AdminStatsResponse(
                new AdminStatsResponse.Users(users.count(),
                        users.countByCreatedAtAfter(LocalDateTime.now().minusDays(7)),
                        users.countByCreatedAtAfter(LocalDateTime.now().minusDays(30)),
                        users.countByLockedAtIsNotNull(), users.countByIsPremiumTrue(),
                        users.countActiveSince(now.minus(Duration.ofDays(7))), users.countStaffPendingSetup()),
                new AdminStatsResponse.Decks(decks.count(), decks.countByVisibility(Deck.PUBLIC), decks.countByOfficialTrue()),
                cards.count(),
                new AdminStatsResponse.Extractions(jobs.count(), jobs.countByStatus(ExtractionJob.DONE),
                        jobs.countByStatus(ExtractionJob.FAILED),
                        jobs.countByStatusIn(List.of(ExtractionJob.QUEUED, ExtractionJob.RUNNING))),
                quizzes.count(), paths.count(), reports.countOpen(), series,
                new AdminStatsResponse.LearningPathBreakdown(paths.countByStatusAndCompletedAtIsNull(LearningPath.ACTIVE),
                        paths.countByCompletedAtIsNotNull(), paths.countByStatus(LearningPath.FAILED),
                        paths.countBySourceType(LearningPath.SOURCE_REMEDIAL), paths.countByStatus(LearningPath.DRAFT)),
                questionBank.countOpenFlags(), mnemonics.countPending(), appeals.countOpen(),
                aiStats(since), ocrSeries(since, from, days), dictionary.countOpenReports(), dictionary.stats());
    }

    /** G6: hiệu suất engine đọc văn bản + bước dịch nghĩa, job tạo trong cửa sổ {@code days}. */
    private AdminStatsResponse.Ai aiStats(Instant since) {
        List<AdminStatsResponse.EngineStat> engines = jobs.engineStats(since).stream()
                .map(r -> new AdminStatsResponse.EngineStat(r.getEngine(), r.getTotal(), r.getFailed(), r.getLowConfidence(),
                        round(r.getAvgConfidence(), 3), round(r.getAvgSeconds(), 1)))
                .toList();
        EnrichStatRow e = jobs.enrichStats(since);
        AdminStatsResponse.Enrich enrich = e == null ? new AdminStatsResponse.Enrich(0, 0, 0, 0)
                : new AdminStatsResponse.Enrich(e.getTotal(), e.getEnriched(), e.getQuota(), e.getError());
        return new AdminStatsResponse.Ai(engines, enrich);
    }

    /** G6: đủ {@code days} phần tử (ngày không có OCR = 0, errorRate null), ngày theo app.learning-path.zone như series. */
    private List<OcrPoint> ocrSeries(Instant since, LocalDate from, int days) {
        Map<LocalDate, OcrDayRow> byDay = new java.util.HashMap<>();
        for (OcrDayRow r : jobs.ocrByDay(since, zone.getId())) byDay.put(r.getDay().toLocalDate(), r);
        List<OcrPoint> out = new ArrayList<>(days);
        for (int i = 0; i < days; i++) {
            LocalDate d = from.plusDays(i);
            OcrDayRow r = byDay.get(d);
            out.add(r == null ? new OcrPoint(d, 0, 0, 0, 0, null) : ocrPoint(d, r.getOcrJobs(), r.getFailed(),
                    r.getLowConfidence(), r.getGeminiFallback()));
        }
        return out;
    }

    static OcrPoint ocrPoint(LocalDate date, long ocrJobs, long failed, long lowConfidence, long geminiFallback) {
        Double rate = ocrJobs > 0 ? round((double) failed / ocrJobs, 4) : null;
        return new OcrPoint(date, ocrJobs, failed, lowConfidence, geminiFallback, rate);
    }

    static Double round(Double v, int places) {
        if (v == null || v.isNaN() || v.isInfinite()) return null;
        return java.math.BigDecimal.valueOf(v).setScale(places, java.math.RoundingMode.HALF_UP).doubleValue();
    }

    /**
     * db / aiService / version / backup + engines (hợp đồng đợt 2 §8 "health.engines"): cờ từng thành phần ai-service lấy từ body
     * GET /api/extract/health trong cùng một lời gọi (timeout 2 giây, hạn chót cả lời gọi kể cả phân giải DNS 3 giây —
     * AiServiceClient.HEALTH_DEADLINE); ai-service tắt -> aiService "down" và engines rỗng. aiModels: xem {@link #aiModels}.
     */
    public Map<String, Object> health() {
        Map<String, Object> m = new LinkedHashMap<>();
        java.util.Optional<JsonNode> body = ai.healthBody();
        m.put("db", "ok");
        m.put("aiService", body.isPresent() ? "ok" : "down");
        m.put("version", version);
        java.nio.file.Path marker = backupMarker.isBlank() ? null : java.nio.file.Path.of(backupMarker);
        m.put("backup", backupStatus(marker, Instant.now()));
        m.put("lastBackupAt", marker != null && java.nio.file.Files.exists(marker) ? lastModified(marker).toString() : null);
        m.put("engines", engineFlags(body.orElse(null)));
        m.put("aiModels", aiModels(body.orElse(null)));
        return m;
    }

    static final int MAX_AI_MODELS = 50;
    static final int MAX_AI_MODEL_CHARS = 64;

    /**
     * Model Gemini ai-service nhận cho "Model AI chính" (Admin > Cấu hình): {default, allowed} từ geminiModel / geminiModels của
     * body health. ai-service lặng lẽ thay tên ngoài danh sách bằng model mặc định (một ô cấu hình không được làm hỏng lượt bóc
     * tách) -> trang cấu hình cần danh sách này để gợi ý và cảnh báo, nếu không Admin tưởng model đã gõ đang chạy. ai-service tắt
     * / bản cũ chưa trả geminiModels -> null. Chỉ giữ chuỗi ngắn, tối đa MAX_AI_MODELS tên (body do ai-service gửi, không tin hẳn).
     */
    static Map<String, Object> aiModels(JsonNode body) {
        if (body == null || !body.path("geminiModels").isArray()) return null;
        List<String> allowed = new ArrayList<>();
        for (JsonNode n : body.get("geminiModels")) {
            String name = n.isTextual() ? n.asText().strip() : "";
            if (!name.isEmpty() && name.length() <= MAX_AI_MODEL_CHARS && !allowed.contains(name) && allowed.size() < MAX_AI_MODELS) {
                allowed.add(name);
            }
        }
        JsonNode def = body.path("geminiModel");
        String defName = def.isTextual() ? def.asText().strip() : "";
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("default", defName.isEmpty() || defName.length() > MAX_AI_MODEL_CHARS ? null : defName);
        m.put("allowed", allowed);
        return m;
    }

    /** Chỉ giữ các khoá boolean của body health (bỏ mọi thông tin khác ai-service có thể gửi kèm); null / không phải object -> {}. */
    static Map<String, Boolean> engineFlags(JsonNode body) {
        Map<String, Boolean> flags = new LinkedHashMap<>();
        if (body == null || !body.isObject()) return flags;
        body.fields().forEachRemaining(e -> {
            if (e.getValue().isBoolean()) flags.put(e.getKey(), e.getValue().booleanValue());
        });
        return flags;
    }

    /** unmonitored (không cấu hình) | missing (chưa có file) | stale (quá 48 giờ) | ok. Dựa vào mtime, không đọc nội dung. */
    static String backupStatus(java.nio.file.Path marker, Instant now) {
        if (marker == null) return "unmonitored";
        if (!java.nio.file.Files.exists(marker)) return "missing";
        return lastModified(marker).isBefore(now.minus(BACKUP_STALE_AFTER)) ? "stale" : "ok";
    }

    private static Instant lastModified(java.nio.file.Path p) {
        try {
            return java.nio.file.Files.getLastModifiedTime(p).toInstant();
        } catch (java.io.IOException e) {
            return Instant.EPOCH;
        }
    }

    private static Map<LocalDate, Long> byDay(List<DayCount> rows) {
        return rows.stream().collect(Collectors.toMap(r -> r.getDay().toLocalDate(), DayCount::getN, Long::sum));
    }

    /** Vị trí i = from + i ngày; ngày không có dữ liệu = 0; ngày ngoài cửa sổ bị bỏ. */
    static long[] fill(Map<LocalDate, Long> counts, LocalDate from, int days) {
        long[] out = new long[days];
        for (int i = 0; i < days; i++) out[i] = counts.getOrDefault(from.plusDays(i), 0L);
        return out;
    }
}
