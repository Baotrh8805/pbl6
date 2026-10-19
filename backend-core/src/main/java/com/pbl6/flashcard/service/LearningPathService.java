package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.deck.DeckRequest;
import com.pbl6.flashcard.dto.deck.DeckResponse;
import com.pbl6.flashcard.dto.deck.DeckResponse.CardResponse;
import com.pbl6.flashcard.dto.deck.QuizAttemptDtos.AttemptState;
import com.pbl6.flashcard.dto.extraction.ExtractionItemResponse;
import com.pbl6.flashcard.dto.extraction.ExtractionOptions;
import com.pbl6.flashcard.dto.extraction.ExtractionRequests.ItemPatch;
import com.pbl6.flashcard.dto.folder.FolderRequest;
import com.pbl6.flashcard.dto.insights.WeaknessResponse.WeakCard;
import com.pbl6.flashcard.dto.learningpath.LearningPathChapterResponse;
import com.pbl6.flashcard.dto.learningpath.LearningPathRequests;
import com.pbl6.flashcard.dto.learningpath.LearningPathResponse;
import com.pbl6.flashcard.dto.learningpath.LearningPathResponse.Completion;
import com.pbl6.flashcard.dto.learningpath.LearningPathResponse.Day;
import com.pbl6.flashcard.dto.learningpath.LearningPathResponse.Forecast;
import com.pbl6.flashcard.dto.learningpath.LearningPathResponse.JobSummary;
import com.pbl6.flashcard.dto.learningpath.LearningPathResponse.Task;
import com.pbl6.flashcard.dto.learningpath.LearningPathResponse.Today;
import com.pbl6.flashcard.dto.learningpath.SessionResponse;
import com.pbl6.flashcard.dto.learningpath.TodaySummaryResponse;
import com.pbl6.flashcard.model.ExtractionItem;
import com.pbl6.flashcard.model.ExtractionJob;
import com.pbl6.flashcard.model.Flashcard;
import com.pbl6.flashcard.model.Folder;
import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.model.LearningPathCard;
import com.pbl6.flashcard.model.LearningPathChapter;
import com.pbl6.flashcard.model.Notification;
import com.pbl6.flashcard.model.QuizAttempt;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.ExtractionItemRepository;
import com.pbl6.flashcard.repository.ExtractionJobRepository;
import com.pbl6.flashcard.repository.FlashcardRepository;
import com.pbl6.flashcard.repository.FolderRepository;
import com.pbl6.flashcard.repository.LearningPathCardRepository;
import com.pbl6.flashcard.repository.LearningPathCardRepository.CardRow;
import com.pbl6.flashcard.repository.LearningPathCardRepository.PathCardRow;
import com.pbl6.flashcard.repository.LearningPathCardRepository.PathCount;
import com.pbl6.flashcard.repository.LearningPathChapterRepository;
import com.pbl6.flashcard.repository.LearningPathRepository;
import com.pbl6.flashcard.repository.UserRepository;
import com.pbl6.flashcard.service.LearningPathScheduler.CardIn;
import com.pbl6.flashcard.service.LearningPathScheduler.DayPos;
import com.pbl6.flashcard.service.LearningPathScheduler.DayRange;
import com.pbl6.flashcard.service.LearningPathScheduler.ForecastDay;
import com.pbl6.flashcard.service.LearningPathScheduler.PlanResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Lộ trình học tập: tạo (job bóc tách purpose = learning_path), dựng bản nháp chương khi job xong, kích hoạt thành lịch theo thẻ
 * (learning_path_cards, V20), phiên học hợp nhất, cân lại lịch, chạy lại / dịch lại (LP-6), kiểm tra chương (QuizSubmittedEvent),
 * chốt hoàn thành, đọc "hôm nay" / tiến độ / dự báo; thông báo trong app khi bản nháp xong / lỗi, qua chương, hoàn thành. Không
 * inject vào ExtractionWorker (vòng phụ thuộc): nhận kết quả qua {@link ExtractionJobFinishedEvent}.
 * <p>Mọi thao tác ghi khoá dòng lộ trình ({@link LearningPathRepository#lockByIdAndUserId}, LP-13) và nhận ngày của máy khách
 * (?date=, LP-11) để response trả đúng "hôm nay" của người dùng, không phải của máy chủ.
 */
@Service
public class LearningPathService {

    private static final Logger log = LoggerFactory.getLogger(LearningPathService.class);
    private static final String NOT_FOUND = "Không tìm thấy lộ trình học.";
    private static final int MAX_TITLE = 100;
    /** "Đã thuộc" = khoảng ôn SRS ≥ 21 ngày (spec §1 mục 5; cùng ngưỡng với deckUtils.calcDeckProgress ở client). */
    static final int MASTERED_DAYS = 21;
    static final String ALL_WEEK = "1111111";
    static final int MIN_CAP = 5;
    static final int MAX_CAP = 200;
    /** Số ngày tối đa của một lộ trình: cùng mốc với CHECK total_days BETWEEN 1 AND 365 (V13) và @Max(365) ở DTO. */
    static final int MAX_TOTAL_DAYS = 365;
    /** Số câu tối đa của bài kiểm tra chương (spec §4.1: size = min(10, số thẻ)). */
    static final int CHAPTER_QUIZ_SIZE = 10;
    /** Lộ trình bổ khuyết (§3.8): từ 8 thẻ yếu mới đề xuất / tạo, tối đa 150 thẻ, 3..30 ngày, tối đa 12 chương (nhóm). */
    public static final int REMEDIAL_MIN_CARDS = 8;
    static final int REMEDIAL_MAX_CARDS = 150;
    public static final int REMEDIAL_MIN_DAYS = 3;
    public static final int REMEDIAL_MAX_DAYS = 30;
    static final int REMEDIAL_MAX_GROUPS = 12;

    private final LearningPathRepository paths;
    private final LearningPathChapterRepository chapters;
    private final LearningPathCardRepository cards;
    private final ExtractionJobRepository jobs;
    private final ExtractionItemRepository items;
    private final ExtractionService extraction;
    // Dùng khi kích hoạt lộ trình (tạo thư mục + bộ thẻ)
    private final DeckService deckService;
    private final FolderService folderService;
    private final FolderRepository folders;
    private final FlashcardRepository flashcards;
    private final UserRepository users;
    private final SettingsService settings;
    private final NotificationService notifications;
    // Bài kiểm tra chương dùng lại lượt quiz exam của bộ thẻ chương
    private final QuizAttemptService quizAttempts;
    private final TransactionTemplate tx;
    private final ZoneId zone;

    public LearningPathService(LearningPathRepository paths, LearningPathChapterRepository chapters,
                               LearningPathCardRepository cards, ExtractionJobRepository jobs,
                               ExtractionItemRepository items, ExtractionService extraction, DeckService deckService,
                               FolderService folderService, FolderRepository folders, FlashcardRepository flashcards,
                               UserRepository users, SettingsService settings, NotificationService notifications,
                               QuizAttemptService quizAttempts, PlatformTransactionManager txm,
                               @Value("${app.learning-path.zone:Asia/Ho_Chi_Minh}") String zone) {
        this.notifications = notifications;
        this.quizAttempts = quizAttempts;
        this.paths = paths;
        this.chapters = chapters;
        this.cards = cards;
        this.jobs = jobs;
        this.items = items;
        this.extraction = extraction;
        this.deckService = deckService;
        this.folderService = folderService;
        this.folders = folders;
        this.flashcards = flashcards;
        this.users = users;
        this.settings = settings;
        this.tx = new TransactionTemplate(txm);
        this.zone = ZoneId.of(zone);
    }

    /** Ngày "hôm nay" theo máy khách (?date=) hoặc theo múi giờ cấu hình. */
    public LocalDate today(LocalDate date) {
        return date != null ? date : LocalDate.now(zone);
    }

    /** Mốc "hết ngày date" theo múi giờ cấu hình (loại trừ): thẻ có due_at trước mốc này là đến hạn trong ngày. */
    private Instant endOf(LocalDate date) {
        return date.plusDays(1).atStartOfDay(zone).toInstant();
    }

    // ---------- tạo ----------

    /**
     * Không @Transactional ở mức phương thức: job + path được lưu trong MỘT giao dịch (LP-10: không còn job mồ côi khi lưu path lỗi,
     * và lượt hạn mức — đếm theo job — chỉ bị trừ khi lộ trình thật sự tồn tại), còn startJob chạy sau khi giao dịch ấy commit vì
     * worker (thread khác) phải đọc được job. dailyCap null → app_settings learning_path_daily_cap_default; studyDays null → cả tuần.
     */
    public LearningPathResponse create(User user, byte[] data, String filename, String text, Integer days,
                                       String title, LocalDate startDate, String optionsJson,
                                       Integer dailyCap, String studyDays) {
        if (days == null || days < 1 || days > MAX_TOTAL_DAYS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Số ngày học phải từ 1 đến " + MAX_TOTAL_DAYS + ".");
        }
        int cap = dailyCap != null ? dailyCap : settings.getInt(SettingsService.KEY_LP_DAILY_CAP);
        requireCap(cap);
        String mask = requireMask(studyDays != null ? studyDays : ALL_WEEK);
        ExtractionOptions options = extraction.parseOptions(optionsJson)
                .withDefaults(user.getJlptLevel()).withSplitChapters(true);

        LearningPath path = new LearningPath();
        path.setId(UUID.randomUUID());
        path.setUserId(user.getId());
        path.setStatus(LearningPath.PROCESSING);
        path.setTitle(pathTitle(title, filename));
        path.setStartDate(startDate != null ? startDate : today(null));
        path.setTotalDays(days);
        path.setDailyCap(cap);
        path.setStudyDays(mask);
        path.setCreatedAt(Instant.now());
        ExtractionJob job = tx.execute(s -> {
            ExtractionJob j = extraction.prepareJob(user, data, filename, text, options, ExtractionJob.PURPOSE_LEARNING_PATH);
            path.setJobId(j.getId());
            path.setSourceType(j.getSourceType());
            path.setSourceName(j.getSourceName());
            paths.save(path);
            return j;
        });

        try {
            extraction.startJob(job, data, filename, text);
        } catch (ResponseStatusException e) {
            path.setStatus(LearningPath.FAILED);
            path.setErrorMessage(ExtractionWorker.cut(e.getReason(), 500));
            paths.save(path);
            throw e;
        }
        return toResponse(path, today(null), false, null);
    }

    /** Tiêu đề: người dùng nhập > tên file bỏ đuôi > "Lộ trình dd/MM/yyyy". */
    private String pathTitle(String title, String filename) {
        String t = ExtractionWorker.cut(title, MAX_TITLE);
        if (t != null) return t;
        if (filename != null) {
            int dot = filename.lastIndexOf('.');
            String base = ExtractionWorker.cut(dot > 0 ? filename.substring(0, dot) : filename, MAX_TITLE);
            if (base != null) return base;
        }
        return "Lộ trình " + DateTimeFormatter.ofPattern("dd/MM/yyyy").format(today(null));
    }

    private static void requireCap(int cap) {
        if (cap < MIN_CAP || cap > MAX_CAP) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Trần thẻ mỗi ngày phải từ 5 đến 200.");
        }
    }

    /** Mask T2..CN: 7 ký tự 0/1 và ít nhất một ngày học (CHECK ở DB; chặn ở đây để trả 400 thay vì 500). */
    private static String requireMask(String mask) {
        if (mask == null || !mask.matches(LearningPathRequests.STUDY_DAYS) || mask.indexOf('1') < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Ngày học trong tuần không hợp lệ (7 ký tự 0/1 cho T2..CN, ít nhất một ngày học).");
        }
        return mask;
    }

    // ---------- dựng bản nháp khi job xong ----------

    /** Chạy trên thread worker. Không bao giờ ném: lỗi -> lộ trình FAILED. */
    @EventListener
    public void onJobFinished(ExtractionJobFinishedEvent e) {
        try {
            tx.executeWithoutResult(s -> buildDraft(e.jobId(), e.status()));
        } catch (RuntimeException ex) {
            log.error("Không dựng được lộ trình cho job {}", e.jobId(), ex);
            try {
                markFailed(e.jobId(), "Không dựng được lộ trình từ kết quả bóc tách.");
            } catch (RuntimeException ignored) {
                // DB lỗi tiếp: để failOrphans xử lý khi khởi động lại
            }
        }
    }

    private void markFailed(UUID jobId, String message) {
        tx.executeWithoutResult(s -> paths.findByJobId(jobId).ifPresent(p -> {
            if (!LearningPath.PROCESSING.equals(p.getStatus())) return;
            fail(p, message);
        }));
    }

    private void buildDraft(UUID jobId, String status) {
        LearningPath path = paths.findByJobId(jobId).orElse(null);
        if (path == null || !LearningPath.PROCESSING.equals(path.getStatus())) return;
        ExtractionJob job = jobs.findById(jobId).orElse(null);
        if (job == null || ExtractionJob.FAILED.equals(status) || !ExtractionJob.DONE.equals(job.getStatus())) {
            String msg = job != null && job.getErrorMessage() != null ? job.getErrorMessage()
                    : "Bóc tách tài liệu thất bại.";
            fail(path, msg);
            return;
        }
        List<ExtractionItem> all = items.findByJobIdOrderByPositionAsc(jobId);
        if (all.isEmpty()) {
            fail(path, "Không trích được từ vựng hay ngữ pháp nào từ tài liệu.");
            return;
        }
        // Chạy lại sau FAILED (LP-6): chương của lần dựng trước (nếu lần đó đã kịp ghi) bỏ đi trước khi dựng mới — item đã được
        // worker thay bằng kết quả phân tích mới nên không còn tham chiếu tới chúng (extraction_items.chapter_id SET NULL).
        List<LearningPathChapter> stale = chapters.findByPathIdOrderByPositionAsc(path.getId());
        if (!stale.isEmpty()) {
            chapters.deleteAll(stale);
            chapters.flush();
        }
        Map<String, Object> stats = job.getStats() != null ? job.getStats() : Map.of();
        boolean detected = Boolean.TRUE.equals(stats.get("chaptersDetected"));
        List<LearningPathChapter> built = detected ? draftFromStats(path, stats.get("chapters"), all) : draftByDays(path, all);
        path.setChaptersDetected(detected);
        path.setStatus(LearningPath.DRAFT);
        path.setErrorMessage(null);
        // Bóc tách mất 2–4 phút nên người dùng thường đã rời trang: báo bản nháp sẵn sàng (spec §4.4), cùng giao dịch với DRAFT
        notifications.notify(path.getUserId(), Notification.LEARNING_PATH_READY,
                Map.of("pathId", path.getId().toString(), "title", path.getTitle(), "chapters", built.size()));
    }

    /** FAILED + thông báo cho người dùng, cùng giao dịch với việc đổi trạng thái (rollback thì không có thông báo "ma"). */
    private void fail(LearningPath path, String message) {
        path.setStatus(LearningPath.FAILED);
        path.setErrorMessage(ExtractionWorker.cut(message, 500));
        notifications.notify(path.getUserId(), Notification.LEARNING_PATH_FAILED,
                Map.of("pathId", path.getId().toString(), "title", path.getTitle(), "reason", path.getErrorMessage()));
    }

    /** Chương theo stats.chapters của ai-service; item thiếu / lạ số chương -> chương đầu. Trả các chương đã lưu (theo position). */
    private List<LearningPathChapter> draftFromStats(LearningPath path, Object raw, List<ExtractionItem> all) {
        if (!(raw instanceof List<?> list) || list.isEmpty()) {
            throw new IllegalStateException("stats.chapters không hợp lệ");
        }
        List<LearningPathChapter> rows = new ArrayList<>();
        Map<Integer, UUID> byNo = new HashMap<>();
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m) || !(m.get("index") instanceof Number n)) {
                throw new IllegalStateException("stats.chapters có phần tử không hợp lệ");
            }
            int index = n.intValue();
            if (byNo.containsKey(index)) continue;
            String title = m.get("title") instanceof String s ? ExtractionWorker.cut(s, MAX_TITLE) : null;
            LearningPathChapter c = newChapter(path, index, title != null ? title : "Chương " + index);
            rows.add(c);
            byNo.put(index, c.getId());
        }
        rows.sort(Comparator.comparingInt(LearningPathChapter::getPosition));
        UUID first = rows.get(0).getId();
        Set<UUID> used = new HashSet<>();
        for (ExtractionItem i : all) {
            i.setChapterId(i.getChapterNo() != null ? byNo.getOrDefault(i.getChapterNo(), first) : first);
            used.add(i.getChapterId());
        }
        // Chương không có item nào (vd. tiêu đề "Bài 1" ngay trước "Phần 1") -> gộp vào chương kề (không có item để
        // chuyển nên chỉ cần bỏ), để bản nháp không hiện chương rỗng và khớp với kết quả kích hoạt.
        rows.removeIf(c -> !used.contains(c.getId()));
        renumber(rows);
        chapters.saveAll(rows);
        return rows;
    }

    /**
     * Không nhận ra chương: ≤ 14 ngày -> mỗi ngày một chương, dài hơn -> mỗi tuần một chương.
     * Chia theo item được chọn để tên chương khớp dải ngày tính sống; item bỏ chọn theo item được chọn đứng trước. Tên chương
     * ("Ngày 3" / "Tuần 2 (ngày 8–14)") lấy từ chính lịch xem trước ({@link #draftSchedule}) và đi theo nó về sau
     * ({@link #syncDayTitles}).
     */
    private List<LearningPathChapter> draftByDays(LearningPath path, List<ExtractionItem> all) {
        int days = path.getTotalDays();
        int selected = (int) all.stream().filter(ExtractionItem::isSelected).count();
        if (selected == 0) {
            // không còn thẻ chọn: một chương chứa tất cả, người dùng tự chọn lại trong bản nháp
            LearningPathChapter only = newChapter(path, 1, "Ngày 1");
            chapters.save(only);
            all.forEach(i -> i.setChapterId(only.getId()));
            return List.of(only);
        }
        // Đọc trình độ trước khi gắn item vào chương chưa lưu: không để một truy vấn nào chen giữa hai bước đó
        String userLevel = userLevel(path);
        int k = days <= 14 ? days : (int) Math.ceil(days / 7.0);
        k = Math.min(k, selected);
        List<Integer> sizes = LearningPathScheduler.evenSplit(selected, k);
        List<LearningPathChapter> rows = new ArrayList<>();
        for (int i = 0; i < k; i++) rows.add(newChapter(path, i + 1, null));
        int chunk = 0;
        int filled = 0;   // số item chọn đã vào chương chunk
        int current = 0;  // chương của item chọn gần nhất phía trước (mặc định chương đầu)
        for (ExtractionItem i : all) {
            if (i.isSelected()) {
                while (filled >= sizes.get(chunk)) {
                    chunk++;
                    filled = 0;
                }
                filled++;
                current = chunk;
            }
            i.setChapterId(rows.get(current).getId());
        }
        Map<UUID, DayRange> ranges = draftSchedule(path, rows, all, userLevel).ranges();
        for (LearningPathChapter c : rows) {
            DayRange r = ranges.get(c.getId());
            c.setTitle(days <= 14 ? dayTitle(r) : weekTitle(c.getPosition(), r));
        }
        chapters.saveAll(rows);
        return rows;
    }

    /** Tên chương tự sinh khi không nhận ra chương: "Ngày 3", "Ngày 3–4" (≤ 14 ngày) hoặc "Tuần 2 (ngày 8–14)". */
    private static final Pattern DAY_TITLE = Pattern.compile("Ngày \\d+(–\\d+)?");
    private static final Pattern WEEK_TITLE = Pattern.compile("Tuần \\d+ \\(ngày \\d+(–\\d+)?\\)");

    private static String dayRangeText(DayRange r) {
        return r.dayFrom() == r.dayTo() ? String.valueOf(r.dayFrom()) : r.dayFrom() + "–" + r.dayTo();
    }

    static String dayTitle(DayRange r) {
        return "Ngày " + dayRangeText(r);
    }

    static String weekTitle(int position, DayRange r) {
        return "Tuần " + position + " (ngày " + dayRangeText(r) + ")";
    }

    /**
     * LP-08: tên chương tự sinh theo ngày ({@link #draftByDays}) phải khớp dải ngày tính sống của bản nháp — đổi số ngày / trần,
     * chọn thẻ hay gộp chương làm dải đổi thì tên đổi theo (trước đây tên chốt lúc tạo: lộ trình 3 ngày có chương "Ngày 10" nằm ở
     * ngày 3). Chỉ đụng chương còn mang tên tự sinh (người dùng chưa đổi tên) của lộ trình KHÔNG nhận ra chương — tiêu đề lấy từ
     * tài liệu như "Ngày 1" của giáo trình giữ nguyên. Sửa trên entity: ghi xuống DB khi caller đang trong giao dịch ghi (PATCH,
     * gộp chương, kích hoạt — bộ thẻ mang đúng tên người dùng vừa thấy), GET chỉ trả tên mới.
     */
    private static void syncDayTitles(LearningPath p, List<LearningPathChapter> rows, Map<UUID, DayRange> ranges) {
        if (Boolean.TRUE.equals(p.getChaptersDetected())) return;
        for (LearningPathChapter c : rows) {
            DayRange r = ranges.get(c.getId());
            String t = c.getTitle();
            if (r == null || t == null) continue;
            String next = DAY_TITLE.matcher(t).matches() ? dayTitle(r)
                    : WEEK_TITLE.matcher(t).matches() ? weekTitle(c.getPosition(), r) : null;
            if (next != null && !next.equals(t)) c.setTitle(next);
        }
    }

    private static LearningPathChapter newChapter(LearningPath path, int position, String title) {
        LearningPathChapter c = new LearningPathChapter();
        c.setId(UUID.randomUUID());
        c.setPathId(path.getId());
        c.setPosition(position);
        c.setTitle(title);
        return c;
    }

    /**
     * Khởi động lại: worker trong RAM đã mất -> lộ trình đang xử lý coi như thất bại. Từng dòng qua {@link #fail} (không UPDATE hàng
     * loạt) để có thông báo LEARNING_PATH_FAILED như mọi lần FAILED khác (spec §4.4) — bóc tách mất 2–4 phút nên đây chính là lúc
     * người dùng đã rời trang và không còn cách nào khác để biết.
     */
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void failOrphans() {
        List<LearningPath> stuck = paths.findByStatus(LearningPath.PROCESSING);
        for (LearningPath p : stuck) fail(p, "Máy chủ đã khởi động lại trong lúc xử lý. Hãy tạo lại lộ trình.");
        if (!stuck.isEmpty()) log.warn("Đánh dấu {} lộ trình dở dang là FAILED sau khi khởi động", stuck.size());
    }

    // ---------- đọc ----------

    LearningPath owned(Long uid, UUID id) {
        return paths.findByIdAndUserId(id, uid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND));
    }

    /** Bản khoá dòng (LP-13) cho mọi thao tác ghi: request song song trên cùng lộ trình xếp hàng thay vì ghi đè nhau. */
    private LearningPath lockedOwned(Long uid, UUID id) {
        return paths.lockByIdAndUserId(id, uid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND));
    }

    /**
     * LP-7: danh sách không N+1 — job, chương, thẻ (kèm learned) và số thẻ đến hạn của MỌI lộ trình ACTIVE lấy bằng một truy vấn
     * mỗi loại, cộng một truy vấn vị trí thẻ cho việc hôm nay; không kèm chapters/days (như 1.0), today + completion cho ACTIVE.
     */
    @Transactional(readOnly = true)
    public List<LearningPathResponse> list(Long uid, LocalDate date) {
        List<LearningPath> all = paths.findByUserIdOrderByCreatedAtDesc(uid);
        Map<UUID, ExtractionJob> jobMap = new HashMap<>();
        List<UUID> jobIds = all.stream().map(LearningPath::getJobId).filter(Objects::nonNull).toList();
        if (!jobIds.isEmpty()) jobs.findAllById(jobIds).forEach(j -> jobMap.put(j.getId(), j));
        Map<UUID, ActiveData> active = loadActiveBatch(
                all.stream().filter(p -> LearningPath.ACTIVE.equals(p.getStatus())).toList(), uid, date, true);
        List<LearningPathResponse> out = new ArrayList<>();
        for (LearningPath p : all) {
            JobSummary job = jobSummary(p.getJobId() == null ? null : jobMap.get(p.getJobId()));
            ActiveData d = active.get(p.getId());
            out.add(d != null ? activeResponse(p, job, d, date, false, null)
                    : response(p, job, null, null, null, null, null, null, null, null));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public LearningPathResponse get(Long uid, UUID id, LocalDate date) {
        return toResponse(owned(uid, id), date, true, null);
    }

    /**
     * Tổng quan / sidebar (LP-16): "hôm nay" của mọi lộ trình ACTIVE, cùng cách tính với today của GET /{id}, batch. LP-10: lộ
     * trình đã xong (done = đã chốt hoặc học hết thẻ, như completion.done) vẫn trả về để widget hiện "Đã hoàn thành" thay vì làm
     * nó biến mất, nhưng xếp sau mọi lộ trình còn học (sắp xếp ổn định: trong mỗi nhóm giữ thứ tự mới tạo trước).
     */
    @Transactional(readOnly = true)
    public List<TodaySummaryResponse> todaySummary(Long uid, LocalDate date) {
        List<LearningPath> active = paths.findByUserIdAndStatusOrderByCreatedAtDesc(uid, LearningPath.ACTIVE);
        Map<UUID, ActiveData> data = loadActiveBatch(active, uid, date, false);
        List<TodaySummaryResponse> out = new ArrayList<>();
        for (LearningPath p : active) {
            ActiveData d = data.get(p.getId());
            TodayStats ts = todayStats(p, date, d.cards(), d.dueCount());
            boolean done = p.getCompletedAt() != null
                    || (!d.cards().isEmpty() && d.cards().stream().allMatch(PathCard::learned));
            out.add(new TodaySummaryResponse(p.getId(), p.getTitle(), ts.dayIndex(), p.getTotalDays(), ts.state(),
                    ts.newCount(), ts.dueCount(), ts.behindCount(), p.getStudyDays(), p.getDailyCap(),
                    p.getCompletedAt(), done));
        }
        out.sort(Comparator.comparing(TodaySummaryResponse::done));
        return out;
    }

    // ---------- sửa ----------

    private static void requireDraft(LearningPath path) {
        if (!LearningPath.DRAFT.equals(path.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Chỉ sửa được khi lộ trình đang ở bước xem trước.");
        }
    }

    private static void requireActive(LearningPath path) {
        if (!LearningPath.ACTIVE.equals(path.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Chỉ dùng được khi lộ trình đang học.");
        }
    }

    private LearningPathChapter ownedChapter(LearningPath path, UUID cid) {
        return chapters.findById(cid).filter(c -> path.getId().equals(c.getPathId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy chương."));
    }

    private static final String ENRICHING = "Đang dịch lại nghĩa, hãy chờ xong.";

    /**
     * Job của lộ trình đang chạy ("Dịch lại nghĩa", LP-6: job RUNNING trong khi lộ trình vẫn DRAFT / ACTIVE) → 409. Worker ghi
     * item và job bằng UPDATE cả dòng từ bản nó đã nạp, nên mọi ghi lên item (chọn / sửa / gộp chương) hay job (kích hoạt, xoá)
     * lúc này và kết quả worker ghi đè lẫn nhau (job kẹt RUNNING, sửa tay bị trả về bản cũ, CANCELLED thành DONE). Trả job
     * (null khi lộ trình không còn job) để caller dùng tiếp khi cần.
     */
    private ExtractionJob jobIfIdle(LearningPath path, String message) {
        if (path.getJobId() == null) return null;
        ExtractionJob job = jobs.findById(path.getJobId()).orElse(null);
        if (job != null && !job.isTerminal()) throw new ResponseStatusException(HttpStatus.CONFLICT, message);
        return job;
    }

    private static String requireTitle(String title, String message) {
        String t = ExtractionWorker.cut(title, MAX_TITLE);
        if (t == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        return t;
    }

    /**
     * Tên / số ngày / ngày bắt đầu / trần / ngày học trong tuần / nhắc. DRAFT: dải ngày tính sống. ACTIVE đổi khung lịch
     * (totalDays, startDate, studyDays, dailyCap) → {@link LearningPathScheduler#replan} thẻ CHƯA học từ hôm nay (spec §7: thẻ đã
     * học giữ scheduled_day, lịch sử không bị viết lại); chương mất bộ thẻ không còn thẻ nên tự nhiên không có dải ngày.
     */
    @Transactional
    public LearningPathResponse patch(Long uid, UUID id, LearningPathRequests.Patch req, LocalDate date) {
        LearningPath path = lockedOwned(uid, id);
        if (LearningPath.PROCESSING.equals(path.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Lộ trình đang được xử lý.");
        }
        if (LearningPath.FAILED.equals(path.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lộ trình đã lỗi, hãy tạo lại.");
        }
        if (req.title() != null) path.setTitle(requireTitle(req.title(), "Tên lộ trình không được để trống."));
        boolean reschedule = false;
        if (req.startDate() != null && !req.startDate().equals(path.getStartDate())) {
            path.setStartDate(req.startDate());
            reschedule = true;
        }
        if (req.dailyCap() != null && req.dailyCap() != path.getDailyCap()) {
            requireCap(req.dailyCap());
            path.setDailyCap(req.dailyCap());
            reschedule = true;
        }
        if (req.studyDays() != null && !req.studyDays().equals(path.getStudyDays())) {
            path.setStudyDays(requireMask(req.studyDays()));
            reschedule = true;
        }
        if (req.totalDays() != null && req.totalDays() != path.getTotalDays()) {
            // ACTIVE: số ngày mới phải ≥ ngày học đang đứng, tính theo startDate / studyDays VỪA đổi ở trên. Nhỏ hơn thì cửa sổ xếp
            // lại rỗng: replan dồn mọi thẻ chưa học vào hôm nay rồi applyPlan ghi đè totalDays bằng chỉ số hôm nay — người dùng
            // nhận một giá trị họ không chọn và một ngày học vô dụng; báo 400 để UI hiện mốc tối thiểu thay vì âm thầm sửa.
            if (LearningPath.ACTIVE.equals(path.getStatus())) {
                int from = placeFrom(path, date);
                if (req.totalDays() < from) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Số ngày không thể nhỏ hơn ngày học hiện tại (" + from + ").");
                }
            }
            path.setTotalDays(req.totalDays());
            reschedule = true;
        }
        if (req.reminder() != null) path.setReminder(req.reminder());
        Boolean overflow = null;
        if (reschedule && LearningPath.ACTIVE.equals(path.getStatus())) {
            PlanResult r = LearningPathScheduler.replan(cardIns(path), placeFrom(path, date), path.getTotalDays(),
                    path.getDailyCap());
            applyPlan(path, r);
            overflow = r.overflow() ? Boolean.TRUE : null;
        }
        return LearningPath.ACTIVE.equals(path.getStatus()) ? activeResult(path, date, overflow)
                : toResponse(path, date, true, overflow);
    }

    @Transactional
    public LearningPathResponse patchChapter(Long uid, UUID id, UUID cid, LearningPathRequests.ChapterPatch req,
                                             LocalDate date) {
        LearningPath path = lockedOwned(uid, id);
        requireDraft(path);
        ownedChapter(path, cid).setTitle(requireTitle(req.title(), "Tên chương không được để trống."));
        return toResponse(path, date, true, null);
    }

    /** Gộp chương vào chương đứng trước: chuyển item, xoá chương, đánh lại position 1..n. */
    @Transactional
    public LearningPathResponse mergeUp(Long uid, UUID id, UUID cid, LocalDate date) {
        LearningPath path = lockedOwned(uid, id);
        requireDraft(path);
        LearningPathChapter chapter = ownedChapter(path, cid);
        jobIfIdle(path, ENRICHING); // chuyển item sang chương khác là ghi lên item
        List<LearningPathChapter> rows = chapters.findByPathIdOrderByPositionAsc(id);
        int idx = rows.indexOf(chapter);
        if (idx <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chương đầu tiên không có chương trước để gộp.");
        }
        UUID target = rows.get(idx - 1).getId();
        items.findByChapterIdOrderByPositionAsc(cid).forEach(i -> i.setChapterId(target));
        rows.remove(idx);
        chapters.delete(chapter);
        renumber(rows);
        return toResponse(path, date, true, null);
    }

    private static void renumber(List<LearningPathChapter> rows) {
        for (int i = 0; i < rows.size(); i++) rows.get(i).setPosition(i + 1);
    }

    /** Chọn / bỏ chọn / sửa item: chuyển cho ExtractionService (cùng kiểm tra). Trả mọi item của job. 409 khi job đang dịch lại. */
    @Transactional
    public List<ExtractionItemResponse> patchItems(Long uid, UUID id, List<ItemPatch> patches) {
        LearningPath path = lockedOwned(uid, id);
        requireDraft(path);
        jobIfIdle(path, ENRICHING);
        return extraction.patchPathItems(uid, requireJobId(path), patches);
    }

    private static UUID requireJobId(LearningPath path) {
        if (path.getJobId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dữ liệu bóc tách của lộ trình không còn.");
        }
        return path.getJobId();
    }

    /** Mọi item (chọn và bỏ chọn) của một chương, theo vị trí trong tài liệu. */
    @Transactional(readOnly = true)
    public List<ExtractionItemResponse> chapterItems(Long uid, UUID id, UUID cid) {
        LearningPath path = owned(uid, id);
        ownedChapter(path, cid);
        return items.findByChapterIdOrderByPositionAsc(cid).stream().map(ExtractionItemResponse::of).toList();
    }

    // ---------- kích hoạt ----------

    /**
     * Bản nháp -> thư mục (metadata learningPathId) + mỗi chương một bộ thẻ (vocab rồi grammar, thứ tự tài liệu) + lịch theo thẻ
     * (LP-5): từng thẻ vừa tạo thành một dòng learning_path_cards với seq (chương rồi thứ tự trong bộ), trọng số theo cấp JLPT so với
     * trình độ người học (§3.1) và scheduled_day từ {@link LearningPathScheduler#plan}; dải ngày / số thẻ của chương suy từ các dòng
     * đó. Chương không còn thẻ chọn bị bỏ (item của nó gắn sang chương kề trước / sau). Lịch không giữ được trần vẫn kích hoạt
     * nhưng response mang overflow=true để UI gợi ý tăng ngày / trần.
     */
    @Transactional
    public LearningPathResponse activate(Long uid, UUID id, LearningPathRequests.Activate req, LocalDate date) {
        LearningPath path = lockedOwned(uid, id);
        requireDraft(path);
        if (req != null && req.startDate() != null) path.setStartDate(req.startDate());
        if (req != null && req.totalDays() != null) path.setTotalDays(req.totalDays());
        if (req != null && req.dailyCap() != null) {
            requireCap(req.dailyCap());
            path.setDailyCap(req.dailyCap());
        }
        if (req != null && req.studyDays() != null) path.setStudyDays(requireMask(req.studyDays()));
        ExtractionJob job = jobIfIdle(path, ENRICHING);
        if (job == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dữ liệu bóc tách của lộ trình không còn.");
        }
        List<ExtractionItem> all = items.findByJobIdOrderByPositionAsc(job.getId());
        User user = users.findById(uid).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND));

        Map<UUID, List<ExtractionItem>> byChapter = new HashMap<>();
        for (ExtractionItem i : all) {
            if (i.getChapterId() != null) byChapter.computeIfAbsent(i.getChapterId(), k -> new ArrayList<>()).add(i);
        }
        List<LearningPathChapter> rows = chapters.findByPathIdOrderByPositionAsc(id);
        // Tên chương tự sinh theo ngày chốt theo đúng bản xem trước (số ngày / trần vừa nhận ở body) trước khi thành tên bộ thẻ
        syncDayTitles(path, rows, draftSchedule(path, rows, all, user.getJlptLevel()).ranges());
        List<LearningPathChapter> kept = new ArrayList<>();
        List<LearningPathChapter> dropped = new ArrayList<>();
        for (LearningPathChapter c : rows) {
            boolean any = byChapter.getOrDefault(c.getId(), List.of()).stream().anyMatch(ExtractionItem::isSelected);
            (any ? kept : dropped).add(c);
        }
        if (kept.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chưa chọn thẻ nào để tạo lộ trình.");
        }
        for (LearningPathChapter c : dropped) {
            // item (bỏ chọn) của chương trống theo chương còn lại đứng trước; chương đầu thì theo chương sau
            LearningPathChapter host = null;
            for (LearningPathChapter k : kept) {
                if (k.getPosition() < c.getPosition() || host == null) host = k;
                if (k.getPosition() > c.getPosition()) break;
            }
            UUID hostId = host.getId();
            byChapter.getOrDefault(c.getId(), List.of()).forEach(i -> i.setChapterId(hostId));
            chapters.delete(c);
        }
        renumber(kept);

        List<ExtractionItem> allSelected = all.stream()
                .filter(i -> i.isSelected() && i.getChapterId() != null).toList();
        FolderRequest folderReq = new FolderRequest(uniqueRootTitle(uid, path.getTitle()), null, "private",
                ExtractionService.dominantLevel(allSelected, job), false, "{\"learningPathId\":\"" + id + "\"}");
        UUID folderId = folderService.createFolder(folderReq, user).getId();

        List<String> deckIds = new ArrayList<>(job.getDeckIds() != null ? job.getDeckIds() : List.of());
        List<CardIn> plan = new ArrayList<>();
        for (LearningPathChapter c : kept) {
            List<ExtractionItem> chosen = byChapter.get(c.getId()).stream().filter(ExtractionItem::isSelected).toList();
            List<ExtractionItem> ordered = new ArrayList<>();
            chosen.stream().filter(i -> !ExtractionItem.GRAMMAR.equals(i.getKind())).forEach(ordered::add);
            chosen.stream().filter(i -> ExtractionItem.GRAMMAR.equals(i.getKind())).forEach(ordered::add);
            DeckRequest deckReq = new DeckRequest(c.getTitle(), ExtractionService.dominantLevel(ordered, job),
                    ExtractionWorker.cut("Chương " + c.getPosition() + " của lộ trình " + path.getTitle(), 1000),
                    folderId, null, "goi", ordered.stream().map(ExtractionService::toCard).toList());
            deckIds.add(createChapterDeck(uid, c, deckReq, user.getJlptLevel(), plan).id());
        }
        // UPDATE một cột, không sửa entity job: flush entity là UPDATE cả dòng mang status / stage / stats đọc ở đầu giao dịch này
        // (dài: thư mục + bộ thẻ + lịch) và sẽ ghi đè DONE / enrichedAt mà worker "Dịch lại nghĩa" có thể vừa ghi xong
        extraction.setDeckIds(job.getId(), deckIds);

        PlanResult r = writeSchedule(path, kept, plan);
        path.setFolderId(folderId);
        path.setStatus(LearningPath.ACTIVE);
        path.setActivatedAt(Instant.now());
        return toResponse(path, date, true, r.overflow() ? Boolean.TRUE : null);
    }

    /** Tên thư mục gốc chưa dùng (không phân biệt hoa thường): "title", "title (2)", ... Tính trước createFolder. */
    private String uniqueRootTitle(Long uid, String title) {
        Set<String> taken = new HashSet<>();
        for (Folder f : folders.findByUser_IdOrderByTitleAsc(uid)) {
            if (f.getParent() == null) taken.add(f.getTitle().toLowerCase(Locale.ROOT));
        }
        if (!taken.contains(title.toLowerCase(Locale.ROOT))) return title;
        String base = title.length() > 94 ? title.substring(0, 94).strip() : title;
        for (int n = 2; ; n++) {
            String candidate = base + " (" + n + ")";
            if (!taken.contains(candidate.toLowerCase(Locale.ROOT))) return candidate;
        }
    }

    /**
     * Tạo bộ thẻ cho một chương (kích hoạt / bổ khuyết dùng chung) và nối thẻ vừa tạo vào đầu vào của bộ xếp lịch: seq tiếp nối
     * (chương trước rồi thứ tự trong bộ = position), trọng số theo cấp thẻ so với trình độ người học (§3.1) — cấp / loại đã
     * nằm trên thẻ nên tính thẳng, không cần nguồn (item bóc tách hay thẻ gốc).
     */
    private DeckResponse createChapterDeck(Long uid, LearningPathChapter c, DeckRequest req, String userLevel,
                                           List<CardIn> plan) {
        DeckResponse deck = deckService.create(uid, req);
        c.setDeckId(deck.id());
        for (CardResponse card : deck.cards()) {
            plan.add(new CardIn(card.id(), c.getId(), plan.size() + 1, LearningPathScheduler.weight(card.level(), userLevel,
                    Flashcard.KIND_GRAMMAR.equals(card.kind())), false, null));
        }
        return deck;
    }

    /**
     * Chốt lịch theo thẻ của một lộ trình vừa dựng xong bộ thẻ: {@link LearningPathScheduler#plan} với số ngày / trần của lộ
     * trình → một dòng learning_path_cards mỗi thẻ, rồi số thẻ + dải ngày từng chương; flush để truy vấn native dựng response
     * thấy ngay các dòng vừa thêm. Trả PlanResult để caller báo overflow.
     */
    private PlanResult writeSchedule(LearningPath path, List<LearningPathChapter> chapterRows, List<CardIn> plan) {
        PlanResult r = LearningPathScheduler.plan(plan, path.getTotalDays(), path.getDailyCap());
        List<LearningPathCard> cardRows = new ArrayList<>(plan.size());
        for (CardIn c : plan) {
            LearningPathCard e = new LearningPathCard();
            e.setPathId(path.getId());
            e.setChapterId(c.chapterId());
            e.setCardId(c.cardId());
            e.setSeq(c.seq());
            e.setScheduledDay(r.dayOf().get(c.cardId()));
            e.setWeight(c.weight());
            cardRows.add(e);
        }
        cards.saveAll(cardRows);
        writeChapterRanges(chapterRows, cardRows);
        cards.flush();
        return r;
    }

    // ---------- lộ trình bổ khuyết (§3.8) ----------

    /**
     * Lộ trình bổ khuyết từ thẻ yếu (đã tính ở {@link InsightService#weakCards}, theo thứ tự ưu tiên): 8..150 thẻ (ít hơn 8 → 409,
     * nhiều hơn lấy 150 thẻ yếu nhất), gom thành chương theo groupBy (tối đa 12 nhóm, nhóm nhỏ gộp vào "Khác"), mỗi chương một bộ
     * thẻ CLONE (term / reading / meaning / segments / Hán-Việt / cấp / loại — thẻ gốc giữ nguyên lịch SRS; DeckRequest không có
     * sourceDeckId nên không ghi nguồn) trong thư mục "Bổ khuyết dd/MM/yyyy" (tên duy nhất như kích hoạt). Không có job bóc tách
     * nên tạo thẳng ACTIVE (spec §7), không tốn lượt hạn mức, không thông báo; lịch theo §3.2 với số ngày người chọn (3..30), trần
     * mặc định của hệ thống, học cả tuần, bắt đầu hôm nay (ngày của máy khách). Xoá như lộ trình thường (giữ bộ thẻ).
     */
    @Transactional
    public LearningPathResponse remedial(Long uid, LearningPathRequests.Remedial req, List<WeakCard> weak, LocalDate date) {
        int days = req.days() == null ? 0 : req.days();
        if (days < REMEDIAL_MIN_DAYS || days > REMEDIAL_MAX_DAYS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Số ngày của lộ trình bổ khuyết phải từ "
                    + REMEDIAL_MIN_DAYS + " đến " + REMEDIAL_MAX_DAYS + ".");
        }
        String groupBy = req.groupBy() == null ? "" : req.groupBy().trim().toLowerCase(Locale.ROOT);
        if (!groupBy.matches("level|kind|kanji|deck")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cách gom phải là level, kind, kanji hoặc deck.");
        }
        if (weak.size() < REMEDIAL_MIN_CARDS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Chưa đủ thẻ yếu để tạo lộ trình bổ khuyết (cần ít nhất "
                    + REMEDIAL_MIN_CARDS + ", hiện có " + weak.size() + ").");
        }
        List<WeakCard> picked = weak.size() > REMEDIAL_MAX_CARDS ? weak.subList(0, REMEDIAL_MAX_CARDS) : weak;
        Map<String, List<WeakCard>> groups = remedialGroups(picked, groupBy);
        User user = users.findById(uid).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND));
        Map<String, Flashcard> source = new HashMap<>();
        flashcards.findAllById(picked.stream().map(WeakCard::cardId).toList()).forEach(f -> source.put(f.getId(), f));

        String label = DateTimeFormatter.ofPattern("dd/MM/yyyy").format(date);
        String title = ExtractionWorker.cut(req.title(), MAX_TITLE);
        if (title == null) title = "Bổ khuyết " + label;
        Instant now = Instant.now();
        LearningPath draft = new LearningPath();
        draft.setId(UUID.randomUUID());
        draft.setUserId(uid);
        draft.setTitle(title);
        draft.setSourceType(LearningPath.SOURCE_REMEDIAL);
        draft.setSourceName("Điểm yếu");
        draft.setStatus(LearningPath.ACTIVE);
        draft.setTotalDays(days);
        draft.setStartDate(date);
        draft.setDailyCap(settings.getInt(SettingsService.KEY_LP_DAILY_CAP));
        draft.setStudyDays(ALL_WEEK);
        draft.setCreatedAt(now);
        draft.setActivatedAt(now);
        FolderRequest folderReq = new FolderRequest(uniqueRootTitle(uid, "Bổ khuyết " + label), null, "private",
                dominantLevel(picked, user), false, "{\"learningPathId\":\"" + draft.getId() + "\"}");
        draft.setFolderId(folderService.createFolder(folderReq, user).getId());
        // id gán tay → save() là merge: bản managed là bản TRẢ VỀ, bản vừa dựng vẫn detached (sửa tiếp trên nó sẽ không được ghi)
        LearningPath path = paths.save(draft);

        List<LearningPathChapter> rows = new ArrayList<>(groups.size());
        for (Map.Entry<String, List<WeakCard>> g : groups.entrySet()) {
            rows.add(newChapter(path, rows.size() + 1, remedialChapterTitle(g.getKey(), groupBy, g.getValue())));
        }
        rows = chapters.saveAll(rows); // cùng lý do: dùng bản managed để ghi deckId / dải ngày
        List<CardIn> plan = new ArrayList<>(picked.size());
        int i = 0;
        for (List<WeakCard> group : groups.values()) {
            LearningPathChapter c = rows.get(i++);
            List<DeckRequest.Card> cardReqs = new ArrayList<>(group.size());
            List<Flashcard> copied = new ArrayList<>(group.size());
            for (WeakCard w : group) {
                Flashcard f = source.get(w.cardId());
                if (f == null) continue; // thẻ vừa bị xoá giữa hai truy vấn: bỏ qua, không 500
                copied.add(f);
                // pos (V22) đi theo bản sao như DeckService.cloneDeck: thiếu nó bộ bổ khuyết mất loại quiz chia động từ
                cardReqs.add(new DeckRequest.Card(null, f.getTerm(), f.getReading(), f.getMeaning(), f.getLevel(), f.getKind(),
                        f.getReadingSegments(), f.getHanViet(), f.getPos()));
            }
            DeckRequest deckReq = new DeckRequest(c.getTitle(), dominantLevel(group, user),
                    ExtractionWorker.cut("Chương " + c.getPosition() + " của lộ trình " + title, 1000), path.getFolderId(),
                    null, remedialCategory(group, groupBy), cardReqs);
            copyDistractors(createChapterDeck(uid, c, deckReq, user.getJlptLevel(), plan), copied);
        }
        PlanResult r = writeSchedule(path, rows, plan);
        return toResponse(path, date, true, r.overflow() ? Boolean.TRUE : null);
    }

    /**
     * Phương án nhiễu của quiz (flashcards.distractors, V22) chỉ suy ra từ term / reading — giống hệt thẻ gốc — nên chép sang bản
     * sao như DeckService.cloneDeck, khỏi gọi lại ai-service; thiếu nó bộ bổ khuyết báo 0 câu chọn đúng chữ / đồng âm dù thẻ gốc
     * có. Thẻ mới khớp thẻ nguồn theo position (= thứ tự trong DeckRequest, 1-based); kiểm thêm term cho chắc.
     */
    private void copyDistractors(DeckResponse deck, List<Flashcard> sources) {
        Map<String, Map<String, Object>> byNewId = new HashMap<>();
        for (CardResponse card : deck.cards()) {
            Integer p = card.position();
            if (p == null || p < 1 || p > sources.size()) continue;
            Flashcard f = sources.get(p - 1);
            if (f.getDistractors() != null && Objects.equals(f.getTerm().trim(), card.term())) {
                byNewId.put(card.id(), f.getDistractors());
            }
        }
        if (byNewId.isEmpty()) return;
        for (Flashcard copy : flashcards.findAllById(byNewId.keySet())) {
            copy.setDistractors(new LinkedHashMap<>(byNewId.get(copy.getId())));
        }
    }

    /**
     * Gom thẻ yếu thành chương theo groupBy (cùng khoá với nhóm ở GET /api/insights/weaknesses — {@link InsightService#groupKey}):
     * nhóm đông trước, hoà theo khoá, "Khác" luôn là chương cuối (nhóm "còn lại" học sau các nhóm có chủ đề, dù đông hơn); quá 12
     * nhóm thì giữ 11 nhóm đông nhất và gộp phần còn lại vào "Khác". Thứ tự thẻ trong mỗi nhóm = thứ tự điểm yếu (thẻ yếu nhất
     * học trước).
     */
    static Map<String, List<WeakCard>> remedialGroups(List<WeakCard> cards, String groupBy) {
        Map<String, List<WeakCard>> by = new LinkedHashMap<>();
        for (WeakCard c : cards) by.computeIfAbsent(InsightService.groupKey(c, groupBy), k -> new ArrayList<>()).add(c);
        List<String> keys = new ArrayList<>(by.keySet());
        keys.sort(Comparator.comparingInt((String k) -> InsightService.OTHER.equals(k) ? 1 : 0)
                .thenComparing(Comparator.comparingInt((String k) -> by.get(k).size()).reversed())
                .thenComparing(Comparator.naturalOrder()));
        Map<String, List<WeakCard>> out = new LinkedHashMap<>();
        if (keys.size() <= REMEDIAL_MAX_GROUPS) {
            for (String k : keys) out.put(k, by.get(k));
            return out;
        }
        Set<String> restIds = new HashSet<>();
        for (String k : keys) {
            if (out.size() < REMEDIAL_MAX_GROUPS - 1 && !InsightService.OTHER.equals(k)) out.put(k, by.get(k));
            else by.get(k).forEach(c -> restIds.add(c.cardId()));
        }
        out.put(InsightService.OTHER, cards.stream().filter(c -> restIds.contains(c.cardId())).toList());
        return out;
    }

    /** Tên chương của một nhóm: cấp ("N5"), loại ("Từ vựng" / "Ngữ pháp"), "Chữ 水", tên bộ thẻ gốc; nhóm gộp là "Khác". */
    private static String remedialChapterTitle(String key, String groupBy, List<WeakCard> group) {
        if (InsightService.OTHER.equals(key)) return InsightService.OTHER;
        return switch (groupBy) {
            case "kind" -> Flashcard.KIND_GRAMMAR.equals(key) ? "Ngữ pháp" : "Từ vựng";
            case "kanji" -> "Chữ " + key;
            case "deck" -> {
                String t = group.isEmpty() ? null : ExtractionWorker.cut(group.get(0).deckTitle(), MAX_TITLE);
                yield t != null ? t : key;
            }
            default -> key;
        };
    }

    /** Chủ đề bộ thẻ của chương: gom theo chữ Hán → kanji; toàn ngữ pháp → bunpou; còn lại goi. */
    private static String remedialCategory(List<WeakCard> group, String groupBy) {
        if ("kanji".equals(groupBy)) return "kanji";
        boolean allGrammar = !group.isEmpty() && group.stream().allMatch(c -> Flashcard.KIND_GRAMMAR.equals(c.kind()));
        return allGrammar ? "bunpou" : "goi";
    }

    /** Cấp JLPT xuất hiện nhiều nhất trong nhóm thẻ (hoà: cấp thấp hơn, N5 trước); không thẻ nào có cấp → trình độ người học, mặc định N5. */
    private static String dominantLevel(List<WeakCard> cards, User user) {
        Map<String, Integer> count = new HashMap<>();
        for (WeakCard c : cards) if (c.level() != null) count.merge(c.level(), 1, Integer::sum);
        return count.entrySet().stream()
                .max(Map.Entry.<String, Integer>comparingByValue().thenComparing(Map.Entry.comparingByKey()))
                .map(Map.Entry::getKey)
                .orElseGet(() -> user.getJlptLevel() != null && user.getJlptLevel().matches("N[1-5]") ? user.getJlptLevel() : "N5");
    }

    // ---------- lịch theo thẻ: cân lại, xếp lại ----------

    /**
     * §3.4 Cân lại lịch khi học trễ: thẻ đã học giữ ngày, thẻ chưa học (nợ + chưa tới ngày) xếp lại từ hôm nay — extend=false vào
     * các ngày còn lại (nhịp dày hơn), extend=true giữ nhịp cũ và kéo dài lộ trình (total_days = ngày cuối mới nếu dài hơn). Không
     * nợ thì không đổi gì ngoài last_rebalanced_at. 409 nếu lộ trình chưa / không còn ACTIVE.
     */
    @Transactional
    public LearningPathResponse rebalance(Long uid, UUID id, LearningPathRequests.Rebalance req, LocalDate date) {
        LearningPath path = lockedOwned(uid, id);
        requireActive(path);
        boolean extend = req != null && req.extend();
        PlanResult r = LearningPathScheduler.rebalance(cardIns(path), placeFrom(path, date), path.getTotalDays(),
                path.getDailyCap(), extend);
        applyPlan(path, r);
        path.setLastRebalancedAt(Instant.now());
        return activeResult(path, date, r.overflow() ? Boolean.TRUE : null);
    }

    /** Mọi thẻ của lộ trình dưới dạng đầu vào thuật toán (learned + scheduledDay hiện có). */
    private List<CardIn> cardIns(LearningPath path) {
        return cards.findRowsWithLearned(path.getId(), path.getUserId()).stream()
                .map(r -> new CardIn(r.getCardId(), r.getChapterId(), r.getSeq(), r.getWeight(), r.getLearned(),
                        r.getScheduledDay()))
                .toList();
    }

    /**
     * Ngày học để bắt đầu xếp thẻ chưa học "kể từ hôm nay": ngày nghỉ theo study_days → ngày học kế tiếp (ngày học gần nhất trước
     * đó đã trôi qua, xếp vào đó là xếp vào quá khứ); trước ngày bắt đầu → 1 (kể cả khi lộ trình chưa chạy thì xếp lại từ đầu).
     */
    private static int placeFrom(LearningPath p, LocalDate date) {
        DayPos pos = LearningPathScheduler.dayIndexFor(p.getStartDate(), date, p.getStudyDays());
        return Math.max(1, pos.rest() ? pos.index() + 1 : pos.index());
    }

    /**
     * Ghi kết quả xếp lịch: scheduled_day mới cho thẻ đổi ngày (thẻ đã học được PlanResult giữ nguyên), kéo total_days khi lịch vượt
     * ngày cuối (qua ngày cuối mà còn nợ → mọi thẻ dồn vào "hôm nay" &gt; totalDays; không kéo thì chúng nằm ngoài days[]), rồi chốt lại
     * số thẻ + dải ngày từng chương. flush để truy vấn native dựng response thấy ngay thay đổi.
     * <p>Lịch cần quá {@link #MAX_TOTAL_DAYS} ngày (kéo dài khi nợ nhiều, hoặc xếp lại sau ngày cuối của lộ trình 365 ngày) → 409
     * TRƯỚC khi ghi: CHECK total_days ≤ 365 ở DB sẽ vỡ lúc flush thành 500 nếu để lọt.
     */
    private void applyPlan(LearningPath path, PlanResult r) {
        if (r.daysUsed() > MAX_TOTAL_DAYS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Lộ trình không thể dài quá " + MAX_TOTAL_DAYS
                    + " ngày (lịch mới cần " + r.daysUsed() + " ngày); hãy tăng trần thẻ mỗi ngày hoặc rút ngắn phần còn lại.");
        }
        List<LearningPathCard> rows = cards.findByPathIdOrderBySeqAsc(path.getId());
        for (LearningPathCard c : rows) {
            Integer d = r.dayOf().get(c.getCardId());
            if (d != null && d != c.getScheduledDay()) c.setScheduledDay(d);
        }
        if (r.daysUsed() > path.getTotalDays()) path.setTotalDays(r.daysUsed());
        writeChapterRanges(chapters.findByPathIdOrderByPositionAsc(path.getId()), rows);
        cards.flush();
    }

    /** cardCount / dayFrom / dayTo của chương = số dòng lịch và min/max scheduled_day của nó; chương không còn thẻ → 0, không dải. */
    private static void writeChapterRanges(List<LearningPathChapter> chapterRows, List<LearningPathCard> rows) {
        Map<UUID, int[]> agg = new HashMap<>(); // [count, min, max]
        for (LearningPathCard c : rows) {
            int[] a = agg.computeIfAbsent(c.getChapterId(), k -> new int[]{0, Integer.MAX_VALUE, 0});
            a[0]++;
            a[1] = Math.min(a[1], c.getScheduledDay());
            a[2] = Math.max(a[2], c.getScheduledDay());
        }
        for (LearningPathChapter ch : chapterRows) {
            int[] a = agg.get(ch.getId());
            ch.setCardCount(a == null ? 0 : a[0]);
            ch.setDayFrom(a == null ? null : a[1]);
            ch.setDayTo(a == null ? null : a[2]);
        }
    }

    // ---------- phiên học ----------

    /**
     * Phiên học hợp nhất (spec §1 mục 1, §4.1). kind=today: thẻ đến hạn (due_at tăng dần) → thẻ nợ (chưa học, xếp ở ngày đã qua,
     * theo seq, cắt bớt để đến hạn + nợ + mới ≤ dailyCap khi có thể — không bao giờ bỏ thẻ mới của hôm nay) → thẻ mới hôm nay (seq).
     * state before: chỉ đến hạn; rest: chỉ đến hạn ("hôm nay nghỉ, vẫn có N thẻ nếu muốn ôn"); after: đến hạn + nợ. kind=catchup:
     * mọi thẻ nợ; due: mọi thẻ đến hạn; chapter: mọi thẻ của chương (seq). mode từng thẻ: new (chưa có reviews) | due (đến hạn tới hết
     * ngày) | cram (đã ôn, chưa đến hạn — client chỉ ghi log). Thẻ đã bị xoá khỏi bộ không còn dòng lịch (CASCADE) nên không xuất hiện.
     */
    @Transactional(readOnly = true)
    public SessionResponse session(Long uid, UUID id, String kind, UUID chapterId, LocalDate date) {
        LearningPath path = owned(uid, id);
        requireActive(path);
        ActiveData d = loadActive(path, date);
        TodayStats ts = todayStats(path, date, d.cards(), d.dueCount());
        Instant until = endOf(date);
        int idx = ts.dayIndex();
        boolean rest = ts.pos().rest();

        List<PathCard> due = new ArrayList<>();
        List<PathCard> catchup = new ArrayList<>();
        List<PathCard> fresh = new ArrayList<>();
        for (PathCard c : d.cards()) {
            if (c.learned()) {
                if (c.dueAt() != null && c.dueAt().isBefore(until)) due.add(c);
            } else if (c.scheduledDay() < idx || (rest && c.scheduledDay() == idx)) {
                catchup.add(c);
            } else if (c.scheduledDay() == idx) {
                fresh.add(c);
            }
        }
        due.sort(Comparator.comparing(PathCard::dueAt).thenComparingInt(PathCard::seq));

        List<PathCard> picked = new ArrayList<>();
        int nNew = 0;
        int nDue = 0;
        int nCatch = 0;
        String k = kind == null ? "today" : kind.trim().toLowerCase(Locale.ROOT);
        switch (k) {
            case "today" -> {
                picked.addAll(due);
                nDue = due.size();
                if ("during".equals(ts.state()) || "after".equals(ts.state())) {
                    int room = Math.max(0, path.getDailyCap() - due.size() - fresh.size());
                    List<PathCard> part = catchup.size() > room ? catchup.subList(0, room) : catchup;
                    picked.addAll(part);
                    nCatch = part.size();
                }
                if ("during".equals(ts.state())) {
                    picked.addAll(fresh);
                    nNew = fresh.size();
                }
            }
            case "catchup" -> {
                picked.addAll(catchup);
                nCatch = catchup.size();
            }
            case "due" -> {
                picked.addAll(due);
                nDue = due.size();
            }
            case "chapter" -> {
                if (chapterId == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thiếu chapterId.");
                }
                LearningPathChapter chapter = d.chapters().stream().filter(c -> c.getId().equals(chapterId)).findFirst()
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy chương."));
                for (PathCard c : d.cards()) {
                    if (!chapter.getId().equals(c.chapterId())) continue;
                    picked.add(c);
                    if (!c.learned()) nNew++;
                    else if (c.dueAt() != null && c.dueAt().isBefore(until)) nDue++;
                }
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "kind phải là today, catchup, due hoặc chapter.");
        }

        Map<UUID, LearningPathChapter> chapterById = new HashMap<>();
        d.chapters().forEach(c -> chapterById.put(c.getId(), c));
        Map<String, Flashcard> byId = new HashMap<>();
        if (!picked.isEmpty()) {
            flashcards.findAllById(picked.stream().map(PathCard::cardId).toList()).forEach(f -> byId.put(f.getId(), f));
        }
        List<SessionResponse.Card> out = new ArrayList<>(picked.size());
        for (PathCard c : picked) {
            Flashcard f = byId.get(c.cardId());
            if (f == null) continue; // thẻ vừa bị xoá giữa hai truy vấn: bỏ qua, không 500
            LearningPathChapter ch = chapterById.get(c.chapterId());
            String deckId = ch != null && ch.getDeckId() != null ? ch.getDeckId() : f.getDeck().getId();
            String mode = !c.learned() ? "new" : c.dueAt() != null && c.dueAt().isBefore(until) ? "due" : "cram";
            out.add(new SessionResponse.Card(f.getId(), deckId, c.chapterId(), ch != null ? ch.getTitle() : null,
                    f.getTerm(), f.getReading(), f.getReadingSegments(), f.getMeaning(), f.getHanViet(), f.getLevel(),
                    f.getKind(), mode));
        }
        return new SessionResponse(k, date, idx, ts.state(), new SessionResponse.Counts(nNew, nDue, nCatch, out.size()), out);
    }

    // ---------- chạy lại / dịch lại (LP-6), kiểm tra chương, hoàn thành ----------

    /**
     * LP-6: lộ trình FAILED chạy lại từ bước ANALYZE trên văn bản job đã trích — không OCR lại, không tạo job mới nên KHÔNG tốn lượt
     * hạn mức. Job đã mất văn bản (housekeeping) hoặc không còn → 400 "Hãy tạo lại". Hai giao dịch như {@link #create}: khoá dòng +
     * đặt PROCESSING rồi commit, sau đó mới đẩy job sang worker ({@link ExtractionService#rerunForPath}) — dispatch trong giao dịch
     * thì worker (ai-service trả lời tức thì) có thể ghi DONE trước khi ta commit và bị ghi đè. Worker xong → onJobFinished dựng lại
     * bản nháp như lần đầu (buildDraft bỏ chương cũ nếu có). Hàng đợi worker đầy → lộ trình về FAILED với lý do, ném 429.
     */
    public LearningPathResponse retry(Long uid, UUID id, LocalDate date) {
        LearningPath path = tx.execute(s -> {
            LearningPath p = lockedOwned(uid, id);
            if (!LearningPath.FAILED.equals(p.getStatus())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Chỉ chạy lại được lộ trình đã lỗi.");
            }
            ExtractionJob job = p.getJobId() == null ? null : jobs.findById(p.getJobId()).orElse(null);
            if (job == null || job.getExtractedText() == null || job.getExtractedText().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hãy tạo lại lộ trình với tài liệu mới.");
            }
            if (!job.isTerminal()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Lượt bóc tách đang được xử lý, hãy đợi xong.");
            }
            p.setStatus(LearningPath.PROCESSING);
            p.setErrorMessage(null);
            return p;
        });
        try {
            extraction.rerunForPath(path.getJobId());
        } catch (ResponseStatusException e) {
            tx.executeWithoutResult(s -> paths.findById(id).ifPresent(p -> {
                p.setStatus(LearningPath.FAILED);
                p.setErrorMessage(ExtractionWorker.cut(e.getReason(), 500));
            }));
            throw e;
        }
        return toResponse(path, date, false, null);
    }

    /**
     * LP-6: "Dịch lại nghĩa" cho item của lộ trình (Gemini hết quota lúc bóc tách): uỷ quyền {@link ExtractionService#reEnrichForPath}
     * — cùng kiểm tra và cooldown 5 phút (429) như bóc tách thường. Chỉ DRAFT / ACTIVE; trạng thái lộ trình KHÔNG đổi (job chạy
     * nền, client poll job.stats.enrichedAt rồi tải lại item). Ở ACTIVE chỉ item bóc tách được dịch lại, thẻ đã tạo không bị viết
     * lại. Dispatch sau khi giao dịch khoá dòng commit (xem {@link #retry}).
     */
    public LearningPathResponse enrich(Long uid, UUID id, LocalDate date) {
        LearningPath path = tx.execute(s -> {
            LearningPath p = lockedOwned(uid, id);
            if (!LearningPath.DRAFT.equals(p.getStatus()) && !LearningPath.ACTIVE.equals(p.getStatus())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Chỉ dịch lại được khi lộ trình ở bản nháp hoặc đang học.");
            }
            requireJobId(p);
            return p;
        });
        extraction.reEnrichForPath(path.getJobId());
        return toResponse(path, date, true, null);
    }

    /**
     * Bài kiểm tra cuối chương (spec §4.1): lượt quiz exam trên bộ thẻ của chương, min(10, số thẻ còn trong lịch) câu; đang có lượt
     * mở trên bộ đó thì QuizAttemptService trả lại lượt đó (resumed). Kết quả về qua {@link #onQuizSubmitted}. Không ghi gì vào lộ
     * trình nên không cần khoá dòng.
     */
    @Transactional
    public AttemptState chapterQuiz(Long uid, UUID id, UUID cid) {
        LearningPath path = owned(uid, id);
        requireActive(path);
        LearningPathChapter chapter = ownedChapter(path, cid);
        if (chapter.getDeckId() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bộ thẻ của chương đã bị xoá, không thể kiểm tra.");
        }
        long n = cards.countByPathIdAndChapterId(id, cid);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Chương không còn thẻ nào để kiểm tra.");
        }
        return quizAttempts.create(uid, chapter.getDeckId(), (int) Math.min(CHAPTER_QUIZ_SIZE, n), QuizAttempt.EXAM);
    }

    /**
     * D4: bài kiểm tra chương chỉ gắn nhãn, không bao giờ chặn học. Nghe {@link QuizSubmittedEvent} (đồng bộ, cùng giao dịch với lần
     * nộp): chương ACTIVE của chính người nộp có bộ thẻ = deck của lượt → quizBestPct = max; lần đầu đạt ≥ learning_path_quiz_pass_pct
     * → quizPassedAt + thông báo LEARNING_PATH_CHAPTER_PASSED. Chỉ tính chế độ exam (lượt do {@link #chapterQuiz} mở): practice trên
     * cùng bộ thẻ lộ đáp án từng câu nên không được coi là "qua chương"; và chỉ tính đề đủ cỡ — POST /api/quiz-attempts cũng mở
     * được exam trên bộ của chương với size 1..50, một đề 1 câu đúng 1/1 = 100 % không phải bài kiểm tra chương (spec §4.1:
     * size = min(10, số thẻ)). Không ném: lỗi ở đây không được làm hỏng việc nộp bài.
     */
    @EventListener
    @Transactional
    public void onQuizSubmitted(QuizSubmittedEvent e) {
        if (!QuizAttempt.EXAM.equals(e.mode()) || e.total() <= 0 || e.deckId() == null) return;
        try {
            int pct = (int) Math.round(100.0 * e.score() / e.total());
            Integer pass = null;
            for (LearningPathChapter c : chapters.findByDeckId(e.deckId())) {
                LearningPath p = paths.findById(c.getPathId()).orElse(null);
                if (p == null || !p.getUserId().equals(e.uid()) || !LearningPath.ACTIVE.equals(p.getStatus())) continue;
                long n = cards.countByPathIdAndChapterId(p.getId(), c.getId());
                if (n == 0 || e.total() < Math.min(CHAPTER_QUIZ_SIZE, n)) continue; // chương hết thẻ không có bài kiểm tra
                if (c.getQuizBestPct() == null || pct > c.getQuizBestPct()) c.setQuizBestPct(pct);
                if (pass == null) pass = settings.getInt(SettingsService.KEY_LP_QUIZ_PASS);
                if (c.getQuizPassedAt() == null && pct >= pass) {
                    c.setQuizPassedAt(Instant.now());
                    notifications.notify(e.uid(), Notification.LEARNING_PATH_CHAPTER_PASSED, Map.of(
                            "pathId", p.getId().toString(), "pathTitle", p.getTitle(),
                            "chapterId", c.getId().toString(), "chapterTitle", c.getTitle(), "pct", pct));
                }
            }
        } catch (RuntimeException ex) {
            log.error("Không chấm được bài kiểm tra chương cho lượt quiz {}", e.attemptId(), ex);
        }
    }

    /**
     * Người dùng chốt hoàn thành (spec §4.1): chỉ khi đã học hết thẻ (completion.learnedPct = 100) — chưa thì 409 kèm số thẻ còn
     * lại; đã chốt rồi gọi lại trả nguyên completedAt, không thông báo lại — kể cả khi sau đó bộ thẻ đã bị xoá (không còn dòng
     * lịch): lộ trình đã hoàn thành thì gọi lại không thể thành 409.
     */
    @Transactional
    public LearningPathResponse complete(Long uid, UUID id, LocalDate date) {
        LearningPath path = lockedOwned(uid, id);
        requireActive(path);
        ActiveData d = loadActive(path, date);
        if (path.getCompletedAt() != null) return activeResponse(path, jobSummaryOf(path), d, date, true, null);
        if (d.cards().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Lộ trình không còn thẻ nào để hoàn thành.");
        }
        long left = d.cards().stream().filter(c -> !c.learned()).count();
        if (left > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Chưa học hết thẻ của lộ trình (còn " + left + " thẻ chưa học).");
        }
        markCompleted(path);
        return activeResponse(path, jobSummaryOf(path), d, date, true, null);
    }

    /** completedAt + thông báo LEARNING_PATH_COMPLETED, đúng một lần. */
    private void markCompleted(LearningPath p) {
        if (p.getCompletedAt() != null) return;
        p.setCompletedAt(Instant.now());
        notifications.notify(p.getUserId(), Notification.LEARNING_PATH_COMPLETED,
                Map.of("pathId", p.getId().toString(), "title", p.getTitle()));
    }

    /**
     * Response đầy đủ của lộ trình ACTIVE sau một thao tác ghi (PATCH, cân lại): nạp dữ liệu một lần và TỰ CHỐT hoàn thành khi đã
     * qua ngày cuối và học hết thẻ (spec §4.1 "tự đặt khi qua ngày cuối và learnedPct = 100"). Chỉ ở lối ghi — GET / session giữ
     * không tác dụng phụ; trong kỳ học mà đã học hết thì completion.done = true và người dùng chốt bằng POST /complete.
     */
    private LearningPathResponse activeResult(LearningPath p, LocalDate date, Boolean overflow) {
        ActiveData d = loadActive(p, date);
        if (p.getCompletedAt() == null && !d.cards().isEmpty() && d.cards().stream().allMatch(PathCard::learned)
                && "after".equals(todayStats(p, date, d.cards(), d.dueCount()).state())) {
            markCompleted(p);
        }
        return activeResponse(p, jobSummaryOf(p), d, date, true, overflow);
    }

    // ---------- xoá ----------

    /**
     * LP-10: xoá kế hoạch (chương + lịch thẻ CASCADE) và item bóc tách, nhưng GIỮ dòng job ở trạng thái CANCELLED, xoá trắng
     * extracted_text / text_meta (phần nặng, text_meta chứa lại văn bản theo khối): hạn mức ngày đếm theo số dòng job nên xoá lộ
     * trình không được hoàn lại lượt. Worker đang ghi vào job đó → 409: lộ trình PROCESSING (bóc tách) hoặc job chưa kết thúc trong
     * khi lộ trình DRAFT / ACTIVE ("Dịch lại nghĩa", LP-6) — xoá dưới chân worker là 500 ở worker, lộ trình kẹt, hoặc worker ghi
     * DONE đè lên CANCELLED. Thư mục / bộ thẻ / review giữ nguyên. Job mồ côi được HousekeepingJob dọn sau 90 ngày (chủ sở hữu /
     * admin xoá tay được sau 24 giờ, {@link ExtractionService#deleteJob}).
     */
    @Transactional
    public void delete(Long uid, UUID id) {
        LearningPath path = lockedOwned(uid, id);
        if (LearningPath.PROCESSING.equals(path.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Đang xử lý, hãy chờ xong rồi xoá.");
        }
        ExtractionJob job = jobIfIdle(path, "Đang dịch lại nghĩa, hãy chờ xong rồi xoá.");
        paths.delete(path);
        if (job == null) return;
        items.deleteByJobId(job.getId());
        job.setStatus(ExtractionJob.CANCELLED);
        job.setExtractedText(null);
        job.setTextMeta(null);
        if (job.getFinishedAt() == null) job.setFinishedAt(Instant.now());
    }

    // ---------- dựng response ----------

    /** Một dòng lịch kèm tiến độ ôn của chính người dùng; position / kind / dueAt chỉ có khi nạp một lộ trình (CardRow). */
    private record PathCard(String cardId, UUID chapterId, int seq, int scheduledDay, double weight, boolean learned,
                            Integer intervalDays, Instant dueAt, Integer position, String kind) {
        boolean mastered() { return intervalDays != null && intervalDays >= MASTERED_DAYS; }

        CardIn toCardIn() { return new CardIn(cardId, chapterId, seq, weight, learned, scheduledDay); }

        PathCard withPosition(Integer pos) {
            return new PathCard(cardId, chapterId, seq, scheduledDay, weight, learned, intervalDays, dueAt, pos, kind);
        }

        static PathCard of(CardRow r) {
            return new PathCard(r.getCardId(), r.getChapterId(), r.getSeq(), r.getScheduledDay(), r.getWeight(),
                    r.getLearned(), r.getIntervalDays(), r.getDueAt(), r.getPosition(), r.getKind());
        }

        static PathCard of(PathCardRow r) {
            return new PathCard(r.getCardId(), r.getChapterId(), r.getSeq(), r.getScheduledDay(), r.getWeight(),
                    r.getLearned(), r.getIntervalDays(), null, null, null);
        }
    }

    /** Dữ liệu đã nạp của một lộ trình ACTIVE: chương theo position, thẻ theo seq, số thẻ đến hạn tới hết ngày đang xét. */
    private record ActiveData(List<LearningPathChapter> chapters, List<PathCard> cards, int dueCount) {}

    /** Vị trí "hôm nay" trong lộ trình và ba con số của phiên học. */
    private record TodayStats(LocalDate date, DayPos pos, String state, int newCount, int dueCount, int behindCount) {
        int dayIndex() { return pos.index(); }
    }

    private ActiveData loadActive(LearningPath p, LocalDate date) {
        List<LearningPathChapter> rows = chapters.findByPathIdOrderByPositionAsc(p.getId());
        List<PathCard> cs = cards.findRowsWithLearned(p.getId(), p.getUserId()).stream().map(PathCard::of).toList();
        Instant until = endOf(date);
        int due = (int) cs.stream().filter(c -> c.dueAt() != null && c.dueAt().isBefore(until)).count();
        return new ActiveData(rows, cs, due);
    }

    /**
     * LP-7: nạp dữ liệu của nhiều lộ trình ACTIVE bằng một truy vấn mỗi loại (chương, thẻ kèm learned, số thẻ đến hạn gom theo lộ
     * trình). withTasks: thêm một truy vấn vị trí trong bộ cho các thẻ xếp đúng hôm nay của từng lộ trình (dựng tasks 1.0).
     */
    private Map<UUID, ActiveData> loadActiveBatch(List<LearningPath> active, Long uid, LocalDate date, boolean withTasks) {
        Map<UUID, ActiveData> out = new HashMap<>();
        if (active.isEmpty()) return out;
        List<UUID> ids = active.stream().map(LearningPath::getId).toList();
        Map<UUID, List<LearningPathChapter>> chapterMap = new HashMap<>();
        if (withTasks) {
            for (LearningPathChapter c : chapters.findByPathIdInOrderByPositionAsc(ids)) {
                chapterMap.computeIfAbsent(c.getPathId(), k -> new ArrayList<>()).add(c);
            }
        }
        Map<UUID, List<PathCard>> cardMap = new HashMap<>();
        for (PathCardRow r : cards.findRowsWithLearnedByPathIds(ids, uid)) {
            cardMap.computeIfAbsent(r.getPathId(), k -> new ArrayList<>()).add(PathCard.of(r));
        }
        Map<UUID, Integer> dueMap = new HashMap<>();
        for (PathCount c : cards.countDueByPathIds(ids, uid, endOf(date))) dueMap.put(c.getPathId(), (int) c.getN());
        if (withTasks) {
            Set<String> todayIds = new LinkedHashSet<>();
            for (LearningPath p : active) {
                DayPos pos = LearningPathScheduler.dayIndexFor(p.getStartDate(), date, p.getStudyDays());
                if (pos.rest()) continue;
                for (PathCard c : cardMap.getOrDefault(p.getId(), List.of())) {
                    if (c.scheduledDay() == pos.index()) todayIds.add(c.cardId());
                }
            }
            if (!todayIds.isEmpty()) {
                Map<String, Integer> positions = new HashMap<>();
                flashcards.findPositions(todayIds).forEach(x -> positions.put(x.getId(), x.getPosition()));
                for (List<PathCard> l : cardMap.values()) {
                    l.replaceAll(c -> todayIds.contains(c.cardId()) ? c.withPosition(positions.get(c.cardId())) : c);
                }
            }
        }
        for (LearningPath p : active) {
            out.put(p.getId(), new ActiveData(chapterMap.getOrDefault(p.getId(), List.of()),
                    cardMap.getOrDefault(p.getId(), List.of()), dueMap.getOrDefault(p.getId(), 0)));
        }
        return out;
    }

    /**
     * Hôm nay của lộ trình theo ngày date: {@link LearningPathScheduler#dayIndexFor} với study_days → state before (chưa tới ngày
     * học 1) | after (qua ngày cuối) | rest (ngày nghỉ theo lịch; dayIndex = ngày học gần nhất trước đó) | during. newCount = thẻ
     * chưa học xếp đúng hôm nay (0 ở ngày nghỉ); behindCount = thẻ chưa học xếp ở ngày đã qua — ngày nghỉ tính cả ngày học gần nhất
     * vì ngày đó đã trôi qua; dueCount = thẻ của lộ trình có reviews.due_at tới hết ngày date theo múi giờ cấu hình (thẻ đến hạn
     * trong ngày được ôn từ sáng).
     */
    private static TodayStats todayStats(LearningPath p, LocalDate date, List<PathCard> cards, int dueCount) {
        DayPos pos = LearningPathScheduler.dayIndexFor(p.getStartDate(), date, p.getStudyDays());
        int idx = pos.index();
        String state = idx < 1 ? "before" : idx > p.getTotalDays() ? "after" : pos.rest() ? "rest" : "during";
        int fresh = 0;
        int behind = 0;
        for (PathCard c : cards) {
            if (c.learned()) continue;
            if (c.scheduledDay() < idx || (pos.rest() && c.scheduledDay() == idx)) behind++;
            else if (c.scheduledDay() == idx) fresh++;
        }
        return new TodayStats(date, pos, state, fresh, dueCount, behind);
    }

    /**
     * Trạng thái chương (ACTIVE), xét theo thứ tự: passed — đã qua bài kiểm tra chương (quizPassedAt); review — còn thẻ và mọi thẻ
     * đều đã học (chỉ còn ôn, chưa qua / chưa làm quiz); current — hôm nay nằm trong dải ngày [dayFrom, dayTo] của chương và còn
     * thẻ chưa học; locked — chương chưa tới ngày (dayFrom &gt; hôm nay); open — còn lại: dải ngày đã qua mà vẫn còn thẻ chưa học
     * (nợ), hoặc chương không còn thẻ nào (bộ thẻ bị xoá) và chưa qua quiz.
     */
    static String chapterState(LearningPathChapter c, int count, int learned, Integer from, Integer to, int dayIndex) {
        if (c.getQuizPassedAt() != null) return "passed";
        if (count > 0 && learned == count) return "review";
        if (from != null && dayIndex >= from && dayIndex <= to) return "current";
        if (from != null && from > dayIndex) return "locked";
        return "open";
    }

    /**
     * Việc của một ngày: thẻ xếp cho ngày đó gộp theo chương (thứ tự chương) kèm cardIds; fromPos/toPos = vị trí nhỏ nhất / lớn
     * nhất của các thẻ trong bộ (flashcards.position, đánh số từ 1 khi tạo bộ), 1..count khi thẻ không có position — client 1.0
     * học dải này qua ?range=, client 2.0 dùng cardIds.
     */
    private static List<Task> tasksFor(List<LearningPathChapter> chapters, List<PathCard> dayCards) {
        if (dayCards == null || dayCards.isEmpty()) return List.of();
        Map<UUID, List<PathCard>> byChapter = new HashMap<>();
        for (PathCard c : dayCards) byChapter.computeIfAbsent(c.chapterId(), k -> new ArrayList<>()).add(c);
        List<Task> out = new ArrayList<>();
        for (LearningPathChapter ch : chapters) {
            List<PathCard> cs = byChapter.get(ch.getId());
            if (cs == null) continue;
            int min = Integer.MAX_VALUE;
            int max = Integer.MIN_VALUE;
            List<String> ids = new ArrayList<>(cs.size());
            for (PathCard c : cs) {
                ids.add(c.cardId());
                if (c.position() != null) {
                    min = Math.min(min, c.position());
                    max = Math.max(max, c.position());
                }
            }
            boolean anyPos = min != Integer.MAX_VALUE;
            out.add(new Task(ch.getId(), ch.getTitle(), ch.getDeckId(), anyPos ? min : 1, anyPos ? max : cs.size(),
                    cs.size(), ids));
        }
        return out;
    }

    private static int pct(int part, int total) {
        return total <= 0 ? 0 : 100 * part / total;
    }

    /**
     * Response của lộ trình ACTIVE, suy hoàn toàn từ learning_path_cards + reviews: chương (số thẻ còn lại, dải ngày, learned /
     * mastered, state), completion, today; full thêm days[] (mọi ngày học 1..totalDays, ngày lịch theo study_days) và forecast.
     */
    private LearningPathResponse activeResponse(LearningPath p, JobSummary job, ActiveData d, LocalDate date, boolean full,
                                                Boolean overflow) {
        TodayStats ts = todayStats(p, date, d.cards(), d.dueCount());
        Map<UUID, List<PathCard>> byChapter = new HashMap<>();
        Map<Integer, List<PathCard>> byDay = new TreeMap<>();
        for (PathCard c : d.cards()) {
            byChapter.computeIfAbsent(c.chapterId(), k -> new ArrayList<>()).add(c);
            byDay.computeIfAbsent(c.scheduledDay(), k -> new ArrayList<>()).add(c);
        }
        List<LearningPathChapterResponse> dtos = new ArrayList<>();
        int learnedAll = 0;
        int masteredAll = 0;
        int passed = 0;
        for (LearningPathChapter c : d.chapters()) {
            List<PathCard> cs = byChapter.getOrDefault(c.getId(), List.of());
            int learned = 0;
            int mastered = 0;
            int vocab = 0;
            int grammar = 0;
            Integer from = null;
            Integer to = null;
            for (PathCard x : cs) {
                if (x.learned()) learned++;
                if (x.mastered()) mastered++;
                if (Flashcard.KIND_GRAMMAR.equals(x.kind())) grammar++; else vocab++;
                from = from == null ? x.scheduledDay() : Math.min(from, x.scheduledDay());
                to = to == null ? x.scheduledDay() : Math.max(to, x.scheduledDay());
            }
            learnedAll += learned;
            masteredAll += mastered;
            if (c.getQuizPassedAt() != null) passed++;
            int perDay = from == null ? 0 : LearningPathScheduler.perDay(cs.size(), new DayRange(from, to));
            dtos.add(new LearningPathChapterResponse(c.getId(), c.getPosition(), c.getTitle(), c.getDeckId(),
                    c.getDeckId() == null, cs.size(), vocab, grammar, from, to, perDay, learned, mastered,
                    chapterState(c, cs.size(), learned, from, to, ts.dayIndex()), c.getQuizBestPct(), c.getQuizPassedAt()));
        }
        int total = d.cards().size();
        Completion completion = new Completion(total, learnedAll, masteredAll, pct(learnedAll, total),
                pct(masteredAll, total), passed, d.chapters().size(),
                p.getCompletedAt() != null || (total > 0 && learnedAll == total));
        List<Task> todayTasks = "during".equals(ts.state()) ? tasksFor(d.chapters(), byDay.get(ts.dayIndex())) : List.of();
        Today today = new Today(date, ts.dayIndex(), ts.state(), todayTasks, ts.newCount(), ts.dueCount(), ts.behindCount());
        List<Day> days = null;
        List<Forecast> forecast = null;
        if (full) {
            days = new ArrayList<>(p.getTotalDays());
            for (int i = 1; i <= p.getTotalDays(); i++) {
                days.add(new Day(i, LearningPathScheduler.dateForDay(p.getStartDate(), i, p.getStudyDays()),
                        tasksFor(d.chapters(), byDay.get(i))));
            }
            forecast = forecast(p, d.cards(), byDay, date);
        }
        return response(p, job, full ? dtos : null, today, days, completion, forecast, null, null, overflow);
    }

    /**
     * §3.3 cho lộ trình đang chạy: thẻ chưa học dự báo theo chuỗi khoảng ôn; thẻ đã học dùng lịch thật — hạn ôn kế tiếp quy về
     * chỉ số ngày học (dayIndexFor theo study_days; rơi vào ngày nghỉ thì tính cho ngày học kế tiếp), thẻ đã quá hạn tính vào ngày
     * đang xét (sẽ ôn ngay hôm nay). Có thẻ đã học là map khác rỗng (kể cả khoá ngoài 1..totalDays) nên forecast không dự báo đúp.
     * <p>LP-02: từ ngày học đang xét trở đi, cột "mới" chỉ đếm thẻ CHƯA học — cùng cách đếm với today.newCount. Thẻ xếp cho hôm
     * nay / ngày sau nhưng đã học trước ("Học chương", học vượt) không còn là việc mới của ngày đó, tải của nó đã nằm ở hạn ôn thật;
     * để lại thì bị đếm hai lần (mới + ôn) và có thể báo vượt trần sai. Ngày đã qua giữ mọi thẻ làm lịch sử.
     */
    private List<Forecast> forecast(LearningPath p, List<PathCard> cards, Map<Integer, List<PathCard>> byDay, LocalDate date) {
        int from = placeFrom(p, date);
        Map<Integer, List<CardIn>> in = new HashMap<>();
        byDay.forEach((day, l) -> in.put(day, l.stream()
                .filter(c -> day < from || !c.learned())
                .map(PathCard::toCardIn).toList()));
        Map<Integer, Integer> actual = new HashMap<>();
        for (PathCard c : cards) {
            if (!c.learned() || c.dueAt() == null) continue;
            LocalDate due = LocalDate.ofInstant(c.dueAt(), zone);
            if (due.isBefore(date)) due = date;
            DayPos pos = LearningPathScheduler.dayIndexFor(p.getStartDate(), due, p.getStudyDays());
            actual.merge(pos.rest() ? pos.index() + 1 : pos.index(), 1, Integer::sum);
        }
        List<Forecast> out = new ArrayList<>();
        for (ForecastDay f : LearningPathScheduler.forecast(in, p.getTotalDays(), p.getDailyCap(), actual)) {
            out.add(new Forecast(f.dayIndex(), LearningPathScheduler.dateForDay(p.getStartDate(), f.dayIndex(), p.getStudyDays()),
                    f.newCount(), f.newWeight(), f.predictedReviews(), f.load(), f.overCap()));
        }
        return out;
    }

    /**
     * Bản nháp (GET /{id}): lịch xem trước = lịch sẽ nhận sau khi kích hoạt (LP-01). {@link #draftSchedule} dựng đúng đầu vào của
     * {@link #activate} (thẻ tương lai theo chương rồi từ vựng → ngữ pháp, trọng số §3.1) và chạy cùng
     * {@link LearningPathScheduler#plan} với số ngày / trần hiện tại; số thẻ / dải ngày / perDay của chương và days[] suy từ đó y
     * như {@link #activeResponse} (trước đây bản nháp dùng allocate 1.0 rải thẻ khắp số ngày, còn kích hoạt dồn về đầu theo 2.0:
     * xem trước "Ngày 1–27, 28–76, 77–120" mà nhận về "Ngày 1–4, 5–12, 13–20"). Cộng suggestedDays (§3.6) và overCap (lịch đó báo
     * overflow). Tên chương tự sinh theo ngày đi theo dải mới ({@link #syncDayTitles}).
     */
    private LearningPathResponse draftResponse(LearningPath p, JobSummary job) {
        List<LearningPathChapter> rows = chapters.findByPathIdOrderByPositionAsc(p.getId());
        List<ExtractionItem> all = p.getJobId() != null ? items.findByJobIdOrderByPositionAsc(p.getJobId()) : List.of();
        DraftSchedule s = draftSchedule(p, rows, all, userLevel(p));
        syncDayTitles(p, rows, s.ranges());

        List<LearningPathChapterResponse> dtos = new ArrayList<>();
        for (LearningPathChapter c : rows) {
            int[] kc = s.counts().getOrDefault(c.getId(), new int[3]);
            DayRange r = s.ranges().get(c.getId());
            dtos.add(new LearningPathChapterResponse(c.getId(), c.getPosition(), c.getTitle(), c.getDeckId(), false,
                    kc[0], kc[1], kc[2], r.dayFrom(), r.dayTo(), LearningPathScheduler.perDay(kc[0], r)));
        }
        // việc từng ngày như ACTIVE: thẻ xếp cho ngày gộp theo chương, fromPos/toPos = vị trí trong bộ của chương; cardIds để
        // trống vì thẻ chưa tồn tại (id ở đây là id item)
        Map<Integer, List<PathCard>> byDay = new TreeMap<>();
        if (s.result() != null) {
            for (CardIn c : s.cards()) {
                int day = s.result().dayOf().get(c.cardId());
                byDay.computeIfAbsent(day, k -> new ArrayList<>()).add(new PathCard(c.cardId(), c.chapterId(), c.seq(), day,
                        c.weight(), false, null, null, s.pos().get(c.cardId()), null));
            }
        }
        List<Day> days = new ArrayList<>(p.getTotalDays());
        for (int i = 1; i <= p.getTotalDays(); i++) {
            days.add(new Day(i, LearningPathScheduler.dateForDay(p.getStartDate(), i, p.getStudyDays()),
                    tasksFor(rows, byDay.get(i)).stream()
                            .map(t -> new Task(t.chapterId(), t.chapterTitle(), t.deckId(), t.fromPos(), t.toPos(), t.count(), null))
                            .toList()));
        }
        int suggested = LearningPathScheduler.suggestDays(s.cards(), p.getDailyCap());
        boolean overCap = s.result() != null && s.result().overflow();
        return response(p, job, dtos, null, days, null, null, suggested, overCap, null);
    }

    /**
     * Lịch xem trước của bản nháp. cards: thẻ mà {@link #activate} sẽ tạo, cùng thứ tự (chương theo position; trong chương từ vựng
     * rồi ngữ pháp theo thứ tự tài liệu), cùng trọng số (cấp item = cấp thẻ, §3.1), id = id item; pos: vị trí của thẻ trong bộ của
     * chương (1-based, = flashcards.position sau kích hoạt); counts: [số thẻ chọn, từ vựng, ngữ pháp] theo chương; result:
     * {@link LearningPathScheduler#plan} với số ngày / trần của lộ trình (null khi chưa chọn thẻ nào); ranges: dải ngày của MỌI
     * chương — chương có thẻ = min/max ngày của thẻ; chương 0 thẻ (kích hoạt sẽ bỏ) đứng một ngày ở cuối chương có thẻ liền trước
     * (không có thì đầu chương sau, không có nữa thì ngày 1) để client vẫn có "Ngày N".
     */
    private record DraftSchedule(List<CardIn> cards, Map<String, Integer> pos, Map<UUID, int[]> counts, PlanResult result,
                                 Map<UUID, DayRange> ranges) {}

    private static DraftSchedule draftSchedule(LearningPath p, List<LearningPathChapter> rows, List<ExtractionItem> all,
                                               String userLevel) {
        Map<UUID, int[]> counts = new HashMap<>();
        Map<UUID, List<ExtractionItem>> chosen = new HashMap<>();
        for (ExtractionItem i : all) {
            if (!i.isSelected() || i.getChapterId() == null) continue;
            int[] c = counts.computeIfAbsent(i.getChapterId(), k -> new int[3]);
            c[0]++;
            if (ExtractionItem.GRAMMAR.equals(i.getKind())) c[2]++; else c[1]++;
            chosen.computeIfAbsent(i.getChapterId(), k -> new ArrayList<>()).add(i);
        }
        List<CardIn> ins = new ArrayList<>();
        Map<String, Integer> pos = new HashMap<>();
        for (LearningPathChapter c : rows) {
            List<ExtractionItem> l = chosen.getOrDefault(c.getId(), List.of());
            int n = 0;
            for (boolean grammar : new boolean[]{false, true}) {
                for (ExtractionItem i : l) {
                    if (ExtractionItem.GRAMMAR.equals(i.getKind()) != grammar) continue;
                    String id = i.getId().toString();
                    ins.add(new CardIn(id, c.getId(), ins.size() + 1,
                            LearningPathScheduler.weight(i.getLevel(), userLevel, grammar), false, null));
                    pos.put(id, ++n);
                }
            }
        }
        PlanResult r = ins.isEmpty() ? null : LearningPathScheduler.plan(ins, p.getTotalDays(), p.getDailyCap());
        Map<UUID, int[]> span = new HashMap<>(); // [min, max] ngày theo chương
        if (r != null) {
            for (CardIn c : ins) {
                int d = r.dayOf().get(c.cardId());
                int[] a = span.computeIfAbsent(c.chapterId(), k -> new int[]{d, d});
                a[0] = Math.min(a[0], d);
                a[1] = Math.max(a[1], d);
            }
        }
        Map<UUID, DayRange> ranges = new HashMap<>();
        for (int idx = 0; idx < rows.size(); idx++) {
            int[] a = span.get(rows.get(idx).getId());
            if (a != null) {
                ranges.put(rows.get(idx).getId(), new DayRange(a[0], a[1]));
                continue;
            }
            Integer day = null;
            for (int j = idx - 1; j >= 0 && day == null; j--) {
                int[] b = span.get(rows.get(j).getId());
                if (b != null) day = b[1];
            }
            for (int j = idx + 1; j < rows.size() && day == null; j++) {
                int[] b = span.get(rows.get(j).getId());
                if (b != null) day = b[0];
            }
            int d = day != null ? day : 1;
            ranges.put(rows.get(idx).getId(), new DayRange(d, d));
        }
        return new DraftSchedule(ins, pos, counts, r, ranges);
    }

    /** Trình độ JLPT của chủ lộ trình (trọng số §3.1); null khi không rõ — weight() coi như N5. */
    private String userLevel(LearningPath p) {
        return users.findById(p.getUserId()).map(User::getJlptLevel).orElse(null);
    }

    private static JobSummary jobSummary(ExtractionJob j) {
        return j == null ? null : new JobSummary(j.getStatus(), j.getStage(), j.getErrorMessage(), j.getStats());
    }

    private JobSummary jobSummaryOf(LearningPath p) {
        return jobSummary(p.getJobId() == null ? null : jobs.findById(p.getJobId()).orElse(null));
    }

    /** Response của một lộ trình: ACTIVE từ lịch thẻ (today luôn có, chapters/days/forecast khi full); DRAFT full như 1.0 + gợi ý. */
    LearningPathResponse toResponse(LearningPath p, LocalDate date, boolean full, Boolean overflow) {
        JobSummary job = jobSummaryOf(p);
        if (LearningPath.ACTIVE.equals(p.getStatus())) {
            return activeResponse(p, job, loadActive(p, date), date, full, overflow);
        }
        if (LearningPath.DRAFT.equals(p.getStatus()) && full) return draftResponse(p, job);
        return response(p, job, null, null, null, null, null, null, null, overflow);
    }

    private static LearningPathResponse response(LearningPath p, JobSummary job, List<LearningPathChapterResponse> chapters,
                                                 Today today, List<Day> days, Completion completion, List<Forecast> forecast,
                                                 Integer suggestedDays, Boolean overCap, Boolean overflow) {
        return new LearningPathResponse(p.getId(), p.getTitle(), p.getStatus(), p.getSourceType(), p.getSourceName(),
                p.getTotalDays(), p.getStartDate(), p.getChaptersDetected(), p.getJobId(), p.getFolderId(),
                p.getCreatedAt(), p.getActivatedAt(), p.getErrorMessage(), job, chapters, today, days,
                p.getDailyCap(), p.getStudyDays(), p.isReminder(), p.getCompletedAt(), p.getLastRebalancedAt(),
                completion, forecast, suggestedDays, overCap, overflow);
    }
}
