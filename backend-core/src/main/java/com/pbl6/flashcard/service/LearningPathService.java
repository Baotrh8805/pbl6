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
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
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
    // GET /{id}: đọc trước, chỉ mở giao dịch ghi khi bản nháp chương "Ngày N" đang lưu bố cục cũ (xem get)
    private final TransactionTemplate readTx;
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
        this.readTx = new TransactionTemplate(txm);
        this.readTx.setReadOnly(true);
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
        path.setCreatedAt(Instant.now().truncatedTo(ChronoUnit.MICROS)); // như completedAt: 202 = mọi lần đọc sau từ DB
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
        Map<String, Object> payload = new java.util.LinkedHashMap<>();
        payload.put("pathId", path.getId().toString());
        payload.put("title", path.getTitle());
        payload.put("chapters", built.size());
        if (ocrDegraded(job)) payload.put("ocrDegraded", true);   // spec 21/10: nhắc soát lại văn bản gốc
        notifications.notify(path.getUserId(), Notification.LEARNING_PATH_READY, payload);
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
     * Không nhận ra chương: ≤ 14 ngày -> mỗi ngày một chương, dài hơn -> mỗi tuần một chương. Dựng = bố cục của một bản nháp chỉ có
     * một chương tự sinh chứa mọi item ({@link #layoutDayChapters}), nên bản nháp đầu tiên chính là bố cục mà mọi lần sửa về sau
     * (đổi số ngày / trần, chọn thẻ) tính lại — rút rồi kéo dài số ngày hay bỏ tick rồi tick lại trả đúng các chương lúc dựng.
     * Không còn thẻ chọn: một chương "Ngày 1" chứa tất cả, người dùng tự chọn lại trong bản nháp.
     */
    private List<LearningPathChapter> draftByDays(LearningPath path, List<ExtractionItem> all) {
        // Đọc trình độ trước khi gắn item vào chương chưa lưu: không để một truy vấn nào chen giữa hai bước đó
        String userLevel = userLevel(path);
        LearningPathChapter only = newChapter(path, 1, "Ngày 1");
        all.forEach(i -> i.setChapterId(only.getId()));
        List<LearningPathChapter> rows = layoutDayChapters(path, List.of(only), all, userLevel);
        chapters.saveAll(rows); // chương chưa lưu nên chương bị gộp chỉ cần không có trong danh sách
        return rows;
    }

    /** Số chương tự sinh: ≤ 14 ngày -> mỗi ngày một chương, dài hơn -> mỗi tuần một chương; không quá số thẻ được chọn. */
    private static int dayChapterCount(int days, int selected) {
        return Math.min(days <= 14 ? days : (int) Math.ceil(days / 7.0), selected);
    }

    /**
     * LP-08: bố cục chương tự sinh ("Ngày N" / "Tuần N (ngày a–b)") của bản nháp không nhận ra chương — hàm thuần của (item được
     * chọn theo thứ tự tài liệu, số ngày, trần, các chương người dùng đặt tên riêng). Dùng khi dựng ({@link #draftByDays}) và ở MỌI
     * lối ghi đổi một trong các đầu vào ấy ({@link #fitDayChapters}), nên bản xem trước luôn là cấu trúc kích hoạt tạo ra và thao tác
     * đi rồi về (rút rồi kéo dài số ngày, hạ rồi nâng trần, bỏ tick rồi tick lại) trả đúng bố cục cũ. Trước đây chỉ có gộp mà không
     * tách lại: bỏ tick hai thẻ làm hai chương dồn một ngày thì tick lại vẫn còn "Ngày a–b"; có một chương đổi tên thì rút số ngày
     * nhồi thẻ chương bên cạnh vào chương ấy và kéo dài lại không tách ra nữa.
     * <ol>
     *   <li>Xô chuẩn: MỌI item chọn (kể cả của chương đặt tên riêng) chia đều theo thứ tự tài liệu thành {@link #dayChapterCount}
     *       xô — đúng cách chia khi dựng.</li>
     *   <li>Chương đặt tên riêng (tên không còn dạng tự sinh) là của người dùng: giữ nguyên item, không bao giờ tự nhận thêm thẻ hay
     *       bị gộp đi (chỉ "Gộp vào chương trước" của chính người dùng đổi được nó). Mỗi dải chương tự sinh liền nhau giữa chúng
     *       (run) chia lại TỪ ĐẦU thành các xô chuẩn rơi vào nó — không phụ thuộc cách chia trước đó nên mới đi rồi về được; item
     *       bỏ chọn theo item chọn đứng trước trong run (đầu run thì theo xô đầu). Run không còn item chọn giữ một chương 0 thẻ
     *       (kích hoạt bỏ). Không có chương đặt tên riêng thì cả bản nháp là một run: đúng bố cục lúc dựng.</li>
     *   <li>Gộp, lặp tới khi hết vì lịch đổi sau mỗi lượt ({@link #mergeSameRange}): chương tự sinh rơi đúng cùng dải ngày với chương
     *       tự sinh liền trước thì gộp vào nó — hai xô cùng một ngày chỉ sinh hai tên "Ngày 2" và hai bộ thẻ trùng tên khi kích hoạt;
     *       hai chương tự sinh cùng dải mà có chương đặt tên riêng chen giữa thì gộp với chương tự sinh bên cạnh trong run của mình.
     *       Chương 0 thẻ không gộp.</li>
     *   <li>Đặt tên chương tự sinh theo dải ngày cuối, kiểu "Ngày" hay "Tuần" theo số ngày HIỆN TẠI.</li>
     *   <li>Id theo nhóm cuối ({@link #keepRunIds}): nhóm thứ j của mỗi run mang id chương thứ j của run trước khi chia, thêm / bớt
     *       ở cuối run — gọi lại với cùng đầu vào không xoá / tạo chương nào.</li>
     * </ol>
     * Chưa chọn thẻ nào: không có lịch để chia nên giữ nguyên các chương (tick lại thẻ đầu tiên là chia lại). Sửa item tại chỗ và trả
     * danh sách chương mới theo position (chương bị bỏ chỉ rời khỏi danh sách — caller xoá nếu đã lưu). Không truy vấn gì: rows có
     * thể chưa lưu, một lần auto-flush chen giữa sẽ ghi item trỏ tới chương chưa có.
     */
    private static List<LearningPathChapter> layoutDayChapters(LearningPath path, List<LearningPathChapter> rows,
                                                               List<ExtractionItem> all, String userLevel) {
        Set<UUID> known = new HashSet<>();
        rows.forEach(c -> known.add(c.getId()));
        // item thuộc các chương này, theo thứ tự tài liệu (all đã theo position)
        List<ExtractionItem> placed = all.stream().filter(i -> known.contains(i.getChapterId())).toList();
        int selected = (int) placed.stream().filter(ExtractionItem::isSelected).count();
        if (selected == 0) {
            List<LearningPathChapter> same = new ArrayList<>(rows);
            syncDayTitles(path, same, draftSchedule(path, same, all, userLevel).ranges());
            return same;
        }

        // 1. Xô chuẩn của từng item chọn
        List<Integer> sizes = LearningPathScheduler.evenSplit(selected, dayChapterCount(path.getTotalDays(), selected));
        Map<UUID, Integer> bucket = new HashMap<>();
        int chunk = 0;
        int filled = 0; // số item chọn đã vào xô chunk
        for (ExtractionItem i : placed) {
            if (!i.isSelected()) continue;
            while (filled >= sizes.get(chunk)) {
                chunk++;
                filled = 0;
            }
            filled++;
            bucket.put(i.getId(), chunk);
        }

        // 2. Chương đặt tên riêng giữ nguyên; mỗi run chia lại theo các xô chuẩn của nó
        Set<UUID> auto = new HashSet<>();
        for (LearningPathChapter c : rows) {
            if (isDayTitle(c.getTitle())) auto.add(c.getId());
        }
        Map<UUID, List<ExtractionItem>> byChapter = new HashMap<>();
        for (ExtractionItem i : placed) byChapter.computeIfAbsent(i.getChapterId(), k -> new ArrayList<>()).add(i);
        List<LearningPathChapter> next = new ArrayList<>();
        List<List<LearningPathChapter>> runs = new ArrayList<>();     // chương của mỗi run trước khi chia (giữ id)
        List<List<LearningPathChapter>> runSlots = new ArrayList<>(); // chương theo xô của run đó (trước khi gộp)
        int idx = 0;
        while (idx < rows.size()) {
            if (!auto.contains(rows.get(idx).getId())) {
                next.add(rows.get(idx++));
                continue;
            }
            List<LearningPathChapter> run = new ArrayList<>();
            List<ExtractionItem> runItems = new ArrayList<>();
            while (idx < rows.size() && auto.contains(rows.get(idx).getId())) {
                LearningPathChapter c = rows.get(idx++);
                run.add(c);
                runItems.addAll(byChapter.getOrDefault(c.getId(), List.of()));
            }
            runItems.sort(Comparator.comparingInt(ExtractionItem::getPosition));
            List<Integer> slots = new ArrayList<>(); // xô có mặt trong run, tăng dần theo thứ tự tài liệu
            for (ExtractionItem i : runItems) {
                Integer b = bucket.get(i.getId());
                if (b != null && (slots.isEmpty() || !slots.get(slots.size() - 1).equals(b))) slots.add(b);
            }
            if (slots.isEmpty()) {
                // run toàn item bỏ chọn: một chương 0 thẻ giữ chúng (không đẩy sang chương đặt tên riêng bên cạnh)
                LearningPathChapter keep = run.get(0);
                runItems.forEach(i -> i.setChapterId(keep.getId()));
                next.add(keep);
                continue;
            }
            List<LearningPathChapter> slotRows = new ArrayList<>();
            for (int slot = 0; slot < slots.size(); slot++) {
                LearningPathChapter c = slot < run.size() ? run.get(slot) : newChapter(path, 0, null);
                auto.add(c.getId());
                slotRows.add(c);
            }
            int current = 0; // xô của item chọn gần nhất phía trước trong run (đầu run: xô đầu)
            for (ExtractionItem i : runItems) {
                Integer b = bucket.get(i.getId());
                if (b != null) {
                    while (!slots.get(current).equals(b)) current++;
                }
                i.setChapterId(slotRows.get(current).getId());
            }
            next.addAll(slotRows);
            runs.add(run);
            runSlots.add(slotRows);
        }
        renumber(next);

        // 3. Gộp chương tự sinh rơi cùng dải
        DraftSchedule s = draftSchedule(path, next, all, userLevel);
        while (mergeSameRange(next, all, auto, s)) {
            renumber(next);
            s = draftSchedule(path, next, all, userLevel);
        }

        // 4. Tên theo dải ngày cuối
        for (LearningPathChapter c : next) {
            if (!auto.contains(c.getId())) continue;
            DayRange r = s.ranges().get(c.getId());
            c.setTitle(path.getTotalDays() <= 14 ? dayTitle(r) : weekTitle(c.getPosition(), r));
        }

        // 5. Id theo nhóm SAU khi gộp
        keepRunIds(next, all, runs, runSlots);
        return next;
    }

    /**
     * Bước cuối của {@link #layoutDayChapters}: nhóm thứ j (sau khi gộp) của mỗi run mang id chương thứ j của run trước khi chia,
     * chương mới chỉ cho nhóm vượt số chương cũ, chương cũ thừa ở cuối run bị bỏ. Trước đây xô thứ j nhận chương thứ j TRƯỚC khi
     * gộp: một lần gộp bỏ chương giữa run (kịch bản A: "Ngày 1–2" nuốt chương kế nó) làm lần gọi sau thiếu một chương cho số xô
     * cũ → chương cuối run bị xoá rồi tạo lại id mới ở mọi lần ghi dù đầu vào không đổi (kích hoạt khác bản xem trước, thẻ chương
     * đang mở ở client đóng lại, đổi tên chương ấy giữa chừng thành 404). Gộp chỉ xảy ra trong một run và không phụ thuộc id nên
     * cách chia giữ nguyên, chỉ đổi nhãn: item chuyển theo một ánh xạ id cũ → id mới áp một lượt (ánh xạ là song ánh, chương cũ
     * thứ j chỉ có thể nằm ở nhóm ≤ j nên chép tên / position lần lượt theo j không ghi đè dữ liệu còn cần đọc).
     */
    private static void keepRunIds(List<LearningPathChapter> next, List<ExtractionItem> all,
                                   List<List<LearningPathChapter>> runs, List<List<LearningPathChapter>> runSlots) {
        Map<UUID, Integer> at = new HashMap<>();
        for (int k = 0; k < next.size(); k++) at.put(next.get(k).getId(), k);
        Map<UUID, UUID> moved = new HashMap<>();
        for (int r = 0; r < runs.size(); r++) {
            List<LearningPathChapter> before = runs.get(r);
            List<LearningPathChapter> groups = runSlots.get(r).stream().filter(c -> at.containsKey(c.getId())).toList();
            for (int j = 0; j < groups.size() && j < before.size(); j++) {
                LearningPathChapter from = groups.get(j);
                LearningPathChapter to = before.get(j);
                if (from == to) continue;
                to.setTitle(from.getTitle());
                to.setPosition(from.getPosition());
                next.set(at.get(from.getId()), to);
                moved.put(from.getId(), to.getId());
            }
        }
        if (moved.isEmpty()) return;
        for (ExtractionItem i : all) {
            UUID to = moved.get(i.getChapterId());
            if (to != null) i.setChapterId(to);
        }
    }

    /**
     * Một lượt gộp của {@link #layoutDayChapters} trên lịch s; true = đã gộp, caller đánh lại position, tính lại lịch rồi gọi tiếp.
     * <ul>
     *   <li>Mọi chương tự sinh (có thẻ) cùng dải với chương tự sinh (có thẻ) liền trước → gộp vào chương trước (item nối sau, thứ tự
     *       tài liệu giữ nguyên vì chương là các khúc liền nhau).</li>
     *   <li>Không còn cặp liền nhau nào: hai chương tự sinh cùng dải mà có chương đặt tên riêng chen giữa — dải ngày đi theo thứ tự
     *       thẻ nên chỉ xảy ra khi cả đoạn ấy nằm trong MỘT ngày ("Ngày 1", "Chào hỏi", "Ngày 1"). Gộp thẳng hai chương thì đảo thứ
     *       tự tài liệu, nhồi vào chương đặt tên riêng thì lấn chương của người dùng; nên chương sau nhận chương tự sinh kế nó trong
     *       run (thành "Ngày 1–2"), không có thì chương trước nhập vào chương tự sinh liền trước nó. Không còn cách nào (mỗi phía chỉ
     *       một chương tự sinh, cùng một ngày — lộ trình rất ngắn) thì để nguyên: giới hạn còn lại, hai chương trùng tên "Ngày N"
     *       cho tới khi người dùng đổi tên một chương.</li>
     * </ul>
     */
    private static boolean mergeSameRange(List<LearningPathChapter> rows, List<ExtractionItem> all, Set<UUID> auto,
                                          DraftSchedule s) {
        boolean merged = false;
        for (int k = 1; k < rows.size(); k++) {
            LearningPathChapter c = rows.get(k);
            LearningPathChapter prev = rows.get(k - 1);
            if (mergeable(c, auto, s) && mergeable(prev, auto, s)
                    && s.ranges().get(c.getId()).equals(s.ranges().get(prev.getId()))) {
                moveItems(all, c, prev);
                rows.remove(k--);
                merged = true;
            }
        }
        if (merged) return true;
        for (int k = 0; k < rows.size(); k++) {
            LearningPathChapter c = rows.get(k);
            if (!mergeable(c, auto, s)) continue;
            DayRange r = s.ranges().get(c.getId());
            int e = k - 1;
            while (e >= 0 && !(mergeable(rows.get(e), auto, s) && r.equals(s.ranges().get(rows.get(e).getId())))) e--;
            if (e < 0) continue;
            if (k + 1 < rows.size() && mergeable(rows.get(k + 1), auto, s)) {
                moveItems(all, rows.get(k + 1), c);
                rows.remove(k + 1);
                return true;
            }
            if (e > 0 && mergeable(rows.get(e - 1), auto, s)) {
                moveItems(all, rows.get(e), rows.get(e - 1));
                rows.remove(e);
                return true;
            }
        }
        return false;
    }

    /** Chương tự sinh còn thẻ chọn: chỉ những chương này tham gia gộp theo dải (chương 0 thẻ kích hoạt tự bỏ). */
    private static boolean mergeable(LearningPathChapter c, Set<UUID> auto, DraftSchedule s) {
        return auto.contains(c.getId()) && s.counts().containsKey(c.getId());
    }

    /** Chuyển mọi item của from sang to (gộp chương trong bộ nhớ). */
    private static void moveItems(List<ExtractionItem> all, LearningPathChapter from, LearningPathChapter to) {
        UUID f = from.getId();
        UUID t = to.getId();
        all.forEach(i -> {
            if (f.equals(i.getChapterId())) i.setChapterId(t);
        });
    }

    /**
     * LP-08: đưa chương của bản nháp không nhận ra chương về đúng bố cục {@link #layoutDayChapters}. Gọi ở MỌI lối ghi đổi đầu vào
     * của bố cục — PATCH số ngày / trần, chọn / sửa item, gộp tay, đổi tên chương (đổi chương nào là tự sinh), kích hoạt — để bản
     * xem trước luôn là cấu trúc kích hoạt sẽ tạo (LP-01): bố cục là hàm thuần nên khi các đầu vào không đổi, gọi lại không đổi gì.
     * Lộ trình nhận ra chương: tiêu đề từ tài liệu, không đụng. Ghi item lên DB nên caller kiểm job rảnh trước ({@link #jobIfIdle}).
     * Trả các chương còn lại (bản managed, theo position) và flush để truy vấn sau thấy ngay.
     */
    private List<LearningPathChapter> fitDayChapters(LearningPath path, List<LearningPathChapter> rows,
                                                     List<ExtractionItem> all, String userLevel) {
        if (Boolean.TRUE.equals(path.getChaptersDetected()) || rows.isEmpty()) return rows;
        List<LearningPathChapter> next = layoutDayChapters(path, rows, all, userLevel);
        // id gán tay → save() là merge: chương mới nhận bản managed TRẢ VỀ (sửa tiếp — deckId khi kích hoạt — phải trên bản đó)
        List<LearningPathChapter> saved = chapters.saveAll(next);
        chapters.deleteAll(rows.stream().filter(c -> !next.contains(c)).toList());
        chapters.flush();
        return saved;
    }

    /** Tên chương còn đúng dạng tự sinh của {@link #draftByDays} (người dùng chưa đổi): "Ngày 3", "Ngày 3–4", "Tuần 2 (ngày 8–14)". */
    private static boolean isDayTitle(String t) {
        return t != null && (DAY_TITLE.matcher(t).matches() || WEEK_TITLE.matcher(t).matches());
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

    /**
     * LP-01 + LP-08: bản nháp không nhận ra chương lưu từ trước khi bố cục chương "Ngày N" thành hàm thuần ({@link #layoutDayChapters})
     * — gộp một chiều khi bỏ tick, gộp tay vào chương "Ngày N" (giờ 400) — vẫn mang cấu trúc cũ. GET chỉ đồng bộ tên (đọc, không
     * ghi) còn kích hoạt và lần ghi đầu tiên chia lại, nên bản xem trước người dùng duyệt khác lộ trình họ nhận (số bộ thẻ, lịch).
     * Chuẩn hoá LƯỜI và theo chủ: {@link #get} gọi hàm này cho bản nháp của chính người đang mở nó, trước khi dựng response, khi
     * lượt đọc thấy bố cục đang lưu khác bố cục đúng ({@link #dayLayoutStale}) — một lần cho mỗi bản nháp cũ. Không quét lúc khởi
     * động: DB dùng chung cả nhóm (máy khác chạy nhánh / mã cũ hơn) nên mỗi lần khởi động nhánh này ở bất kỳ máy nào sẽ ghi lên
     * bản nháp của mọi người dùng (D7: thay đổi trên DB chung chỉ thêm, tối thiểu).
     * <p>path là dòng caller vừa khoá — cùng thứ tự khoá với mọi lối ghi (dòng lộ trình trước, rồi chương / item) nên không deadlock
     * với chúng — và điều kiện được xét LẠI sau khi khoá: kích hoạt hay "Dịch lại nghĩa" có thể chen vào giữa lượt đọc của GET và
     * lượt khoá; job đang chạy thì bỏ qua (worker ghi item, GET đầu tiên sau khi job xong sẽ chia lại). Bố cục là hàm thuần, cả id
     * chương ({@link #keepRunIds}), nên bản nháp đã đúng không có giá trị nào đổi → không câu UPDATE nào; hai GET song song chỉ ghi
     * một lần: GET sau chờ khoá, đọc lại bố cục đã chuẩn hoá và không đổi gì.
     */
    private void relayoutDayChapterDraft(LearningPath path) {
        if (!dayLayoutDue(path)) return;
        List<LearningPathChapter> rows = chapters.findByPathIdOrderByPositionAsc(path.getId());
        List<ExtractionItem> all = items.findByJobIdOrderByPositionAsc(path.getJobId());
        List<String> before = layoutKey(rows, all);
        List<LearningPathChapter> after = fitDayChapters(path, rows, all, userLevel(path));
        if (!before.equals(layoutKey(after, all))) {
            log.info("Đưa bản nháp {} về đúng bố cục chương theo ngày khi chủ lộ trình mở", path.getId());
        }
    }

    /**
     * Bản nháp mà {@link #relayoutDayChapterDraft} có thể phải chia lại: DRAFT không nhận ra chương (chaptersDetected null cũng coi
     * là không, như {@link #fitDayChapters}) và job đã xong. Job đang chạy thì không: trang lộ trình poll GET suốt lúc dịch lại
     * nghĩa, các lần ấy vẫn chỉ đọc, không khoá dòng.
     */
    private boolean dayLayoutDue(LearningPath p) {
        if (!LearningPath.DRAFT.equals(p.getStatus()) || Boolean.TRUE.equals(p.getChaptersDetected()) || p.getJobId() == null) {
            return false;
        }
        return jobs.findById(p.getJobId()).map(ExtractionJob::isTerminal).orElse(false);
    }

    /**
     * Bản nháp {@link #dayLayoutDue} mà bố cục đang lưu khác bố cục đúng ({@link #layoutDayChapters}): chỉ khi đó {@link #get} mới mở
     * giao dịch ghi khoá dòng. Bản nháp đã đúng là trường hợp thường — vừa dựng, sau mỗi lối ghi (đều qua {@link #fitDayChapters}),
     * sau GET đầu đã chuẩn hoá — mà trang lộ trình gọi GET sau mỗi thao tác sửa và poll mỗi 2 s sau "Dịch lại nghĩa": các lần ấy chỉ
     * đọc, không khoá dòng nên không xếp hàng sau kích hoạt / PATCH đang giữ khoá. Chạy trong giao dịch CHỈ ĐỌC của GET:
     * layoutDayChapters sửa chương / item tại chỗ nhưng giao dịch chỉ đọc không flush (FlushMode.MANUAL, entity read-only) nên
     * không gì xuống DB; layoutKey phủ đúng các trường nó sửa (id / position / tên chương, chương của item) nên hai khoá bằng nhau
     * = các entity đã về đúng giá trị đang lưu, caller dựng response tiếp trên chúng được. Khác nhau thì caller bỏ giao dịch này
     * và không dùng các entity đã sửa: get chỉ gọi hàm này khi lượt đọc là giao dịch ngoài cùng, EntityManager của nó đóng cùng
     * giao dịch (spring.jpa.open-in-view=false) nên giao dịch ghi sau đó nạp lại chương / item từ DB.
     */
    private boolean dayLayoutStale(LearningPath p, List<LearningPathChapter> rows, List<ExtractionItem> all) {
        if (rows.isEmpty()) return false; // fitDayChapters cũng không đụng
        List<String> before = layoutKey(rows, all);
        return !before.equals(layoutKey(layoutDayChapters(p, rows, all, userLevel(p)), all));
    }

    /** Dấu vân tay bố cục để biết có đổi gì: chương (id, position, tên) rồi chương của từng item theo thứ tự tài liệu. */
    private static List<String> layoutKey(List<LearningPathChapter> rows, List<ExtractionItem> all) {
        List<String> out = new ArrayList<>();
        for (LearningPathChapter c : rows) out.add(c.getId() + "#" + c.getPosition() + " " + c.getTitle());
        for (ExtractionItem i : all) out.add(i.getId() + ">" + i.getChapterId());
        return out;
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
                    : response(p, job, null, null, null, null, null, null, null, null, null));
        }
        return out;
    }

    /**
     * Lộ trình đầy đủ, một giao dịch chỉ đọc như trước — kể cả bản nháp chương "Ngày N" đã đúng bố cục: lượt đọc dựng bố cục đúng
     * trong bộ nhớ để so ({@link #dayLayoutStale}) rồi dựng response trên chính chương / item đã nạp. Chỉ bản nháp đang lưu bố cục
     * cũ (job đã xong): giao dịch ghi ngắn khoá dòng, xét lại dưới khoá và đưa bố cục về đúng thứ kích hoạt sẽ tạo
     * ({@link #relayoutDayChapterDraft}), sau đó response dựng trong giao dịch chỉ đọc như mọi GET — tên chương draftResponse đồng
     * bộ vẫn chỉ nằm ở response, không ghi. Chỉ chủ lộ trình tới được bước ghi: người khác nhận 404 ngay ở lượt đọc (staff bị chặn
     * 403 từ SecurityConfig). Lỗi ở bước chuẩn hoá (vd. deadlock với lối ghi khác) không làm hỏng GET: trả bố cục đang lưu, GET sau
     * thử lại. Đang trong giao dịch của caller (InsightService.next: readOnly, chỉ đọc lộ trình ACTIVE) thì chỉ đọc, không chuẩn hoá
     * — giao dịch ghi lồng vào đó sẽ hỏng (SELECT ... FOR UPDATE trong giao dịch chỉ đọc) và kéo hỏng luôn giao dịch của caller.
     */
    public LearningPathResponse get(Long uid, UUID id, LocalDate date) {
        boolean outermost = !TransactionSynchronizationManager.isActualTransactionActive();
        LearningPathResponse plain = readTx.execute(s -> {
            LearningPath p = owned(uid, id);
            if (!outermost || !dayLayoutDue(p)) return toResponse(p, date, true, null);
            List<LearningPathChapter> rows = chapters.findByPathIdOrderByPositionAsc(id);
            List<ExtractionItem> all = items.findByJobIdOrderByPositionAsc(p.getJobId());
            return dayLayoutStale(p, rows, all) ? null : draftResponse(p, jobSummaryOf(p), rows, all);
        });
        if (plain != null) return plain;
        try {
            tx.executeWithoutResult(s -> paths.lockByIdAndUserId(id, uid).ifPresent(this::relayoutDayChapterDraft));
        } catch (RuntimeException e) {
            log.warn("Không chia lại được chương bản nháp {}: {}", id, e.toString());
        }
        return readTx.execute(s -> toResponse(owned(uid, id), date, true, null)); // vừa bị xoá giữa chừng: 404 như mọi GET
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
     * lúc này và kết quả worker ghi đè lẫn nhau (job kẹt RUNNING, sửa tay bị trả về bản cũ, CANCELLED thành DONE). Bản nháp chờ
     * theo MỘT quy tắc cho cả loại nhận ra chương lẫn không: mọi thao tác đổi cấu trúc chương (số ngày / trần, chọn thẻ, gộp, đổi
     * tên chương, kích hoạt) — ở bản không nhận ra chương chúng ghi lại item (chương "Ngày N" chia lại), ở bản kia thì không,
     * nhưng người dùng không biết bản nháp thuộc loại nào và UI khoá đúng các ô ấy khi job chạy. Trả job (null khi lộ trình không
     * còn job) để caller dùng tiếp khi cần.
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
     * Tên / số ngày / ngày bắt đầu / trần / ngày học trong tuần / nhắc. DRAFT: dải ngày tính sống; bản nháp không nhận ra chương
     * đổi số ngày / trần thì chương "Ngày N" chia lại / gộp theo lịch mới ({@link #fitDayChapters}); đổi số ngày / trần của MỌI
     * bản nháp → 409 khi đang dịch lại nghĩa ({@link #jobIfIdle}), tên / ngày bắt đầu / ngày học / nhắc vẫn sửa được. ACTIVE đổi
     * khung lịch (totalDays, startDate, studyDays, dailyCap) → {@link LearningPathScheduler#replan} thẻ CHƯA học từ hôm nay (spec §7: thẻ đã
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
        boolean previewChanged = false; // số ngày / trần: hai đầu vào duy nhất của lịch xem trước (draftSchedule)
        if (req.startDate() != null && !req.startDate().equals(path.getStartDate())) {
            path.setStartDate(req.startDate());
            reschedule = true;
        }
        if (req.dailyCap() != null && req.dailyCap() != path.getDailyCap()) {
            requireCap(req.dailyCap());
            path.setDailyCap(req.dailyCap());
            reschedule = true;
            previewChanged = true;
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
            previewChanged = true;
        }
        if (req.reminder() != null) path.setReminder(req.reminder());
        // Bản nháp: số ngày / trần làm lịch xem trước đổi (ngày bắt đầu / ngày học trong tuần không đổi chỉ số ngày học) -> bản
        // không nhận ra chương chia lại chương "Ngày N" theo lịch mới (LP-08). Trần cũng chia lại như số ngày: hạ trần làm tràn
        // lịch thì hai chương kề dồn vào một ngày và bị gộp, nâng trần lại phải tách ra được. Đang dịch lại nghĩa thì 409 cho mọi
        // bản nháp, cả bản nhận ra chương (không ghi item): một quy tắc khớp UI khoá ô số ngày / trần khi job chạy — trước đây
        // loại này nhận, loại kia 409 trong khi ô nhập vẫn giữ số vừa gõ.
        if (LearningPath.DRAFT.equals(path.getStatus()) && previewChanged) {
            ExtractionJob job = jobIfIdle(path, ENRICHING);
            if (job != null && !Boolean.TRUE.equals(path.getChaptersDetected())) {
                fitDayChapters(path, chapters.findByPathIdOrderByPositionAsc(id),
                        items.findByJobIdOrderByPositionAsc(job.getId()), userLevel(path));
            }
        }
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

    /**
     * Đổi tên chương bản nháp. Bản nháp không nhận ra chương: tên quyết định chương là tự sinh ("Ngày N": chia lại theo lịch) hay
     * của người dùng (giữ nguyên thẻ), nên đổi tên là đổi bố cục → {@link #fitAfterEdit}: đặt tên riêng thì chương ấy thôi bị chia
     * lại, gõ tay đúng dạng "Ngày 2" thì nó lại thành chương tự sinh và theo lịch như kích hoạt sẽ làm. 409 khi đang dịch lại nghĩa
     * cho mọi bản nháp ({@link #jobIfIdle}).
     */
    @Transactional
    public LearningPathResponse patchChapter(Long uid, UUID id, UUID cid, LearningPathRequests.ChapterPatch req,
                                             LocalDate date) {
        LearningPath path = lockedOwned(uid, id);
        requireDraft(path);
        String title = requireTitle(req.title(), "Tên chương không được để trống.");
        LearningPathChapter chapter = ownedChapter(path, cid);
        ExtractionJob job = jobIfIdle(path, ENRICHING);
        chapter.setTitle(title);
        fitAfterEdit(path, job);
        return toResponse(path, date, true, null);
    }

    /**
     * LP-01 + LP-08: sau thao tác sửa bản nháp đổi một đầu vào của bố cục chương ngoài PATCH số ngày / trần (chọn / sửa item, gộp
     * chương tay, đổi tên chương), đưa chương "Ngày N" về đúng bố cục mới ngay ({@link #fitDayChapters}) để GET hiện đúng thứ kích
     * hoạt sẽ tạo. Trước đây ở đây chỉ gộp chứ không chia lại (để bỏ tick không dời thẻ khác dưới tay người đang duyệt): bỏ tick
     * hai thẻ gộp hai chương, tick lại vẫn còn chương "Ngày a–b". Giờ chương "Ngày N" là xô ngày của các thẻ ĐANG chọn nên bỏ tick
     * một thẻ có thể dời vài thẻ sang chương bên cạnh — danh sách chương đang mở ở client tự tải lại khi bố cục đổi
     * (PathDraftEditor).
     */
    private void fitAfterEdit(LearningPath path, ExtractionJob job) {
        if (job == null || Boolean.TRUE.equals(path.getChaptersDetected())) return;
        fitDayChapters(path, chapters.findByPathIdOrderByPositionAsc(path.getId()),
                items.findByJobIdOrderByPositionAsc(job.getId()), userLevel(path));
    }

    private static final String MERGE_INTO_DAY_CHAPTER = "Chương trước được chia tự động theo ngày nên không gộp vào được. "
            + "Hãy đặt tên riêng cho chương trước rồi gộp, hoặc giảm số ngày học.";

    /**
     * Gộp chương vào chương đứng trước: chuyển item, xoá chương, đánh lại position 1..n. Bản nháp không nhận ra chương: chương trước
     * phải là chương đặt tên riêng — chương "Ngày N" là xô ngày tính lại từ thẻ đang chọn / số ngày / trần
     * ({@link #layoutDayChapters}) nên gộp vào nó bị chia lại ngay và nút gộp thành vô tác dụng → 400 kèm cách làm (client ẩn nút
     * ở các chương này). Gộp vào chương đặt tên riêng thì chương ấy nhận thẻ (người dùng chọn), các chương "Ngày N" còn lại chia
     * lại theo bố cục mới.
     */
    @Transactional
    public LearningPathResponse mergeUp(Long uid, UUID id, UUID cid, LocalDate date) {
        LearningPath path = lockedOwned(uid, id);
        requireDraft(path);
        LearningPathChapter chapter = ownedChapter(path, cid);
        ExtractionJob job = jobIfIdle(path, ENRICHING); // chuyển item sang chương khác là ghi lên item
        List<LearningPathChapter> rows = chapters.findByPathIdOrderByPositionAsc(id);
        int idx = rows.indexOf(chapter);
        if (idx <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chương đầu tiên không có chương trước để gộp.");
        }
        LearningPathChapter host = rows.get(idx - 1);
        if (!Boolean.TRUE.equals(path.getChaptersDetected()) && isDayTitle(host.getTitle())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, MERGE_INTO_DAY_CHAPTER);
        }
        UUID target = host.getId();
        items.findByChapterIdOrderByPositionAsc(cid).forEach(i -> i.setChapterId(target));
        rows.remove(idx);
        chapters.delete(chapter);
        renumber(rows);
        fitAfterEdit(path, job); // chương nhận dài ra đẩy lịch các chương sau: chương "Ngày N" phía sau chia lại
        return toResponse(path, date, true, null);
    }

    private static void renumber(List<LearningPathChapter> rows) {
        for (int i = 0; i < rows.size(); i++) rows.get(i).setPosition(i + 1);
    }

    /**
     * Chọn / bỏ chọn / sửa item: chuyển cho ExtractionService (cùng kiểm tra), rồi chia lại chương "Ngày N" theo thẻ đang chọn
     * ({@link #fitAfterEdit}: số thẻ / cấp đổi làm lịch xem trước đổi). Trả mọi item của job (response không mang chương nên chia
     * lại không đổi nó). 409 khi job đang dịch lại.
     */
    @Transactional
    public List<ExtractionItemResponse> patchItems(Long uid, UUID id, List<ItemPatch> patches) {
        LearningPath path = lockedOwned(uid, id);
        requireDraft(path);
        ExtractionJob job = jobIfIdle(path, ENRICHING);
        List<ExtractionItemResponse> out = extraction.patchPathItems(uid, requireJobId(path), patches);
        fitAfterEdit(path, job);
        return out;
    }

    private static UUID requireJobId(LearningPath path) {
        if (path.getJobId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dữ liệu bóc tách của lộ trình không còn.");
        }
        return path.getJobId();
    }

    /**
     * Mọi item (chọn và bỏ chọn) của một chương, theo vị trí trong tài liệu. Chỉ đọc, không chuẩn hoá bố cục như {@link #get}: client
     * chỉ hỏi id chương lấy từ GET /{id} hay response của lối ghi (đều đã đúng bố cục); chia lại ở đây có thể xoá đúng chương mà thẻ
     * đang mở hỏi tới (404) khi job vừa xong giữa hai lời gọi, trong khi danh sách chương client đang hiện vẫn là bản cũ.
     */
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

        // Chương tự sinh theo ngày chốt theo đúng bố cục của số ngày / trần vừa nhận ở body trước khi thành bộ thẻ (LP-08: không
        // bao giờ hai chương cùng dải -> hai bộ thẻ trùng tên). Body không đổi gì thì không đổi gì: mọi lối sửa bản nháp đã đưa
        // chương về đúng bố cục (hàm thuần) nên bản xem trước = kết quả (LP-01)
        List<LearningPathChapter> rows = fitDayChapters(path, chapters.findByPathIdOrderByPositionAsc(id), all,
                user.getJlptLevel());
        Map<UUID, List<ExtractionItem>> byChapter = new HashMap<>();
        for (ExtractionItem i : all) {
            if (i.getChapterId() != null) byChapter.computeIfAbsent(i.getChapterId(), k -> new ArrayList<>()).add(i);
        }
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
        path.setActivatedAt(Instant.now().truncatedTo(ChronoUnit.MICROS));
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
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
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
        path.setLastRebalancedAt(Instant.now().truncatedTo(ChronoUnit.MICROS));
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
     * Spec 21/10: văn bản gốc job đã trích (để người dùng soát / sửa khi OCR hạ cấp). 404 không phải chủ; 400 job không còn văn bản
     * (FAILED ở bước TEXT, housekeeping) -> "Hãy tạo lại".
     */
    public String sourceText(Long uid, UUID id) {
        return readTx.execute(s -> {
            LearningPath p = owned(uid, id);
            ExtractionJob job = p.getJobId() == null ? null : jobs.findById(p.getJobId()).orElse(null);
            if (job == null || job.getExtractedText() == null || job.getExtractedText().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hãy tạo lại lộ trình với tài liệu mới.");
            }
            return job.getExtractedText();
        });
    }

    /**
     * Spec 21/10: người dùng sửa văn bản gốc (OCR hạ cấp vì Gemini quá tải) rồi phân tích lại — như {@link #retry} nhưng nhận cả
     * DRAFT (bản nháp hiện tại bị dựng lại) và ghi văn bản mới; không tạo job mới nên KHÔNG tốn lượt. ACTIVE / PROCESSING -> 409.
     */
    public LearningPathResponse updateText(Long uid, UUID id, String text, LocalDate date) {
        if (text == null || text.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Văn bản không được để trống.");
        }
        LearningPath path = tx.execute(s -> {
            LearningPath p = lockedOwned(uid, id);
            if (!LearningPath.DRAFT.equals(p.getStatus()) && !LearningPath.FAILED.equals(p.getStatus())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Chỉ sửa được văn bản gốc của bản nháp hoặc lộ trình đã lỗi.");
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
            extraction.updateTextForPath(path.getJobId(), text);
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
     * Bài kiểm tra cuối chương (spec §4.1): LUÔN là lượt quiz exam trên bộ thẻ của chương, min(10, số thẻ còn trong lịch) câu. Chỉ
     * nối lại (resumed) lượt exam đang mở mà nộp ra được {@link #onQuizSubmitted} tính cho chương (đủ cỡ đề); lượt mở khác trên
     * bộ đó — practice của trang Quiz, exam ít câu — bị nộp thay (chấm như hết hạn) để phát đề mới, trừ khi đề mới cũng thiếu câu
     * (QuizAttemptService.chapterExam). Trước đây lượt practice đang mở được trả lại nguyên vẹn: người học làm đúng hết mà chương
     * không qua. Kết quả về qua {@link #onQuizSubmitted}. Không ghi gì vào lộ trình nên không cần khoá dòng.
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
        return quizAttempts.chapterExam(uid, chapter.getDeckId(), (int) Math.min(CHAPTER_QUIZ_SIZE, n));
    }

    /**
     * D4: bài kiểm tra chương chỉ gắn nhãn, không bao giờ chặn học. Nghe {@link QuizSubmittedEvent} (đồng bộ, cùng giao dịch với lần
     * nộp): chương ACTIVE của chính người nộp có bộ thẻ = deck của lượt → quizBestPct = max; lần đầu đạt ≥ learning_path_quiz_pass_pct
     * → quizPassedAt + thông báo LEARNING_PATH_CHAPTER_PASSED. Chỉ tính chế độ exam (lượt do {@link #chapterQuiz} mở): practice trên
     * cùng bộ thẻ lộ đáp án từng câu nên không được coi là "qua chương"; và chỉ tính đề đủ cỡ — POST /api/quiz-attempts cũng mở
     * được exam trên bộ của chương với size 1..50, một đề 1 câu đúng 1/1 = 100 % không phải bài kiểm tra chương (spec §4.1:
     * size = min(10, số thẻ)). Lượt đầu tiên của chương mà dưới ngưỡng → thông báo LEARNING_PATH_CHAPTER_RETRY (D4 "nhắc làm lại
     * nếu chưa đạt"); các lần trượt sau không nhắc lại — trang lộ trình đã hiện "Chưa đạt N% — Làm lại" tới khi qua. Không ném: lỗi
     * ở đây không được làm hỏng việc nộp bài.
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
                boolean firstTry = c.getQuizBestPct() == null;
                if (firstTry || pct > c.getQuizBestPct()) c.setQuizBestPct(pct);
                if (pass == null) pass = settings.getInt(SettingsService.KEY_LP_QUIZ_PASS);
                if (c.getQuizPassedAt() != null) continue;
                if (pct >= pass) {
                    c.setQuizPassedAt(Instant.now());
                    notifications.notify(e.uid(), Notification.LEARNING_PATH_CHAPTER_PASSED, Map.of(
                            "pathId", p.getId().toString(), "pathTitle", p.getTitle(),
                            "chapterId", c.getId().toString(), "chapterTitle", c.getTitle(), "pct", pct));
                } else if (firstTry) {
                    notifications.notify(e.uid(), Notification.LEARNING_PATH_CHAPTER_RETRY, Map.of(
                            "pathId", p.getId().toString(), "pathTitle", p.getTitle(),
                            "chapterId", c.getId().toString(), "chapterTitle", c.getTitle(), "pct", pct, "passPct", pass));
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

    /**
     * completedAt + thông báo LEARNING_PATH_COMPLETED, đúng một lần. Làm tròn xuống micro giây = độ chính xác của timestamptz:
     * response của chính lần chốt trả mốc trong RAM, mọi lần đọc sau trả mốc từ DB — để nguyên nano giây thì hai chuỗi lệch nhau
     * (…05.5059365Z rồi …05.505937Z) và client so khớp / khoá cache theo completedAt thấy như hai mốc khác nhau.
     */
    private void markCompleted(LearningPath p) {
        if (p.getCompletedAt() != null) return;
        p.setCompletedAt(Instant.now().truncatedTo(ChronoUnit.MICROS));
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

    /**
     * Dữ liệu đã nạp của một lộ trình ACTIVE: chương theo position, thẻ theo seq, số thẻ đến hạn tới hết ngày đang xét;
     * meaningQuestions = bộ thẻ của chương -> số câu nghĩa bộ đó ra được (bài kiểm tra chương chỉ gồm câu nghĩa), để biết chương
     * nào có bài kiểm tra tính được ({@link #inChaptersTotal}). Chỉ nạp khi có chương (today-summary không dựng completion).
     */
    private record ActiveData(List<LearningPathChapter> chapters, List<PathCard> cards, int dueCount,
                              Map<String, Integer> meaningQuestions) {}

    /** Vị trí "hôm nay" trong lộ trình và ba con số của phiên học. */
    private record TodayStats(LocalDate date, DayPos pos, String state, int newCount, int dueCount, int behindCount) {
        int dayIndex() { return pos.index(); }
    }

    private ActiveData loadActive(LearningPath p, LocalDate date) {
        List<LearningPathChapter> rows = chapters.findByPathIdOrderByPositionAsc(p.getId());
        List<PathCard> cs = cards.findRowsWithLearned(p.getId(), p.getUserId()).stream().map(PathCard::of).toList();
        Instant until = endOf(date);
        int due = (int) cs.stream().filter(c -> c.dueAt() != null && c.dueAt().isBefore(until)).count();
        return new ActiveData(rows, cs, due, meaningQuestionsByDeck(rows));
    }

    /**
     * Bộ thẻ của các chương -> số câu nghĩa bộ đó ra được ({@link QuizCapabilities#meaningQuestions}, cùng điều kiện sinh đề của
     * QuizService.build trên CẢ bộ thẻ). Một truy vấn chỉ lấy nội dung thẻ, không nạp entity. Bộ không còn thẻ nào: không có khoá.
     */
    private Map<String, Integer> meaningQuestionsByDeck(List<LearningPathChapter> rows) {
        Set<String> deckIds = new HashSet<>();
        for (LearningPathChapter c : rows) if (c.getDeckId() != null) deckIds.add(c.getDeckId());
        if (deckIds.isEmpty()) return Map.of();
        Map<String, List<String>> meanings = new HashMap<>();
        for (FlashcardRepository.DeckMeaning m : flashcards.findMeaningsByDeckIds(deckIds)) {
            meanings.computeIfAbsent(m.getDeckId(), k -> new ArrayList<>()).add(m.getMeaning());
        }
        Map<String, Integer> out = new HashMap<>();
        meanings.forEach((deckId, list) -> out.put(deckId, QuizCapabilities.meaningQuestions(list)));
        return out;
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
        // Một truy vấn cho bộ thẻ của mọi chương (mỗi chương một bộ riêng nên dùng chung một map được)
        Map<String, Integer> questions = withTasks
                ? meaningQuestionsByDeck(chapterMap.values().stream().flatMap(List::stream).toList()) : Map.of();
        for (LearningPath p : active) {
            out.put(p.getId(), new ActiveData(chapterMap.getOrDefault(p.getId(), List.of()),
                    cardMap.getOrDefault(p.getId(), List.of()), dueMap.getOrDefault(p.getId(), 0), questions));
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
     * Trạng thái chương (ACTIVE), xét theo thứ tự: passed — đã qua bài kiểm tra chương (quizPassedAt); empty — chương không còn
     * thẻ nào trong lịch (bộ thẻ bị xoá, hoặc từng thẻ bị xoá khỏi bộ — CASCADE) mà chưa qua quiz (spec §7 "trống"): không còn gì
     * để học hay kiểm tra, nên tách khỏi open để client không mời "học nợ" một chương rỗng; review — mọi thẻ đều đã học (chỉ còn
     * ôn, chưa qua / chưa làm quiz); current — hôm nay nằm trong dải ngày [dayFrom, dayTo] của chương và còn thẻ chưa học; locked
     * — chương chưa tới ngày (dayFrom &gt; hôm nay); open — còn lại: dải ngày đã qua mà vẫn còn thẻ chưa học (nợ). Điểm quiz dưới
     * ngưỡng không đổi trạng thái (D4: chỉ gắn nhãn) — client tự hiện "Chưa đạt N% — Làm lại" từ quizBestPct / quizPassPct.
     */
    static String chapterState(LearningPathChapter c, int count, int learned, Integer from, Integer to, int dayIndex) {
        if (c.getQuizPassedAt() != null) return "passed";
        if (count == 0) return "empty";
        if (learned == count) return "review";
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
     * Chương có vào mẫu số completion.chaptersTotal không. Đã qua: luôn đếm (chaptersPassed ≤ chaptersTotal, kể cả qua rồi mới
     * hết thẻ). Chưa qua: chỉ khi bài kiểm tra của nó nộp ra được tính "qua chương" — còn thẻ (chương "empty" bị POST /quiz từ chối
     * 409) và bộ thẻ ra được ít nhất min(10, số thẻ) câu nghĩa, đúng cỡ đề {@link #onQuizSubmitted} đòi. Chương 1 thẻ của lộ trình
     * ôn điểm yếu (gom theo kanji / bộ / cấp độ), chương mọi thẻ cùng một nghĩa: không phát được đề (attemptId null) hoặc đề thiếu
     * câu không bao giờ qua — đếm vào thì "N/M chương đã qua kiểm tra" kẹt dưới M/M mãi dù đã qua mọi chương còn lại.
     */
    static boolean inChaptersTotal(LearningPathChapter c, int cards, Map<String, Integer> meaningQuestions) {
        if (c.getQuizPassedAt() != null) return true;
        if (cards == 0 || c.getDeckId() == null) return false;
        return meaningQuestions.getOrDefault(c.getDeckId(), 0) >= Math.min(CHAPTER_QUIZ_SIZE, cards);
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
        int quizzable = 0;
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
            String state = chapterState(c, cs.size(), learned, from, to, ts.dayIndex());
            if (inChaptersTotal(c, cs.size(), d.meaningQuestions())) quizzable++;
            int perDay = from == null ? 0 : LearningPathScheduler.perDay(cs.size(), new DayRange(from, to));
            dtos.add(new LearningPathChapterResponse(c.getId(), c.getPosition(), c.getTitle(), c.getDeckId(),
                    c.getDeckId() == null, cs.size(), vocab, grammar, from, to, perDay, learned, mastered,
                    state, c.getQuizBestPct(), c.getQuizPassedAt()));
        }
        int total = d.cards().size();
        Completion completion = new Completion(total, learnedAll, masteredAll, pct(learnedAll, total),
                pct(masteredAll, total), passed, quizzable,
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
        // Ngưỡng qua chương chỉ đi cùng danh sách chương (full): danh sách / today-summary không tốn thêm một lần đọc cấu hình.
        Integer passPct = full ? settings.getInt(SettingsService.KEY_LP_QUIZ_PASS) : null;
        return response(p, job, full ? dtos : null, today, days, completion, passPct, forecast, null, null, overflow);
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
        return draftResponse(p, job, rows, all);
    }

    /** {@link #draftResponse(LearningPath, JobSummary)} trên chương / item caller đã nạp ({@link #get} vừa dùng để so bố cục). */
    private LearningPathResponse draftResponse(LearningPath p, JobSummary job, List<LearningPathChapter> rows,
                                               List<ExtractionItem> all) {
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
        return response(p, job, dtos, null, days, null, null, null, suggested, overCap, null);
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
        return j == null ? null : new JobSummary(j.getStatus(), j.getStage(), j.getErrorMessage(), j.getStats(),
                j.getFailureKind(), ocrDegraded(j) ? Boolean.TRUE : null);
    }

    /** text_meta.ocrDegraded của ai-service (spec 21/10): có trang OCR giữ bản Tesseract vì Gemini quá tải. */
    private static boolean ocrDegraded(ExtractionJob j) {
        return j.getTextMeta() != null && Boolean.TRUE.equals(j.getTextMeta().get("ocrDegraded"));
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
        return response(p, job, null, null, null, null, null, null, null, null, overflow);
    }

    private static LearningPathResponse response(LearningPath p, JobSummary job, List<LearningPathChapterResponse> chapters,
                                                 Today today, List<Day> days, Completion completion, Integer quizPassPct,
                                                 List<Forecast> forecast, Integer suggestedDays, Boolean overCap,
                                                 Boolean overflow) {
        return new LearningPathResponse(p.getId(), p.getTitle(), p.getStatus(), p.getSourceType(), p.getSourceName(),
                p.getTotalDays(), p.getStartDate(), p.getChaptersDetected(), p.getJobId(), p.getFolderId(),
                p.getCreatedAt(), p.getActivatedAt(), p.getErrorMessage(), job, chapters, today, days,
                p.getDailyCap(), p.getStudyDays(), p.isReminder(), p.getCompletedAt(), p.getLastRebalancedAt(),
                completion, quizPassPct, forecast, suggestedDays, overCap, overflow);
    }
}
