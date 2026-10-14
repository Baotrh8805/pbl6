package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.extraction.ExtractionOptions;
import com.pbl6.flashcard.dto.learningpath.LearningPathChapterResponse;
import com.pbl6.flashcard.dto.learningpath.LearningPathResponse;
import com.pbl6.flashcard.dto.learningpath.LearningPathResponse.JobSummary;
import com.pbl6.flashcard.dto.learningpath.LearningPathResponse.Today;
import com.pbl6.flashcard.model.ExtractionItem;
import com.pbl6.flashcard.model.ExtractionJob;
import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.model.LearningPathChapter;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.ExtractionItemRepository;
import com.pbl6.flashcard.repository.ExtractionJobRepository;
import com.pbl6.flashcard.repository.FolderRepository;
import com.pbl6.flashcard.repository.LearningPathChapterRepository;
import com.pbl6.flashcard.repository.LearningPathRepository;
import com.pbl6.flashcard.repository.UserRepository;
import com.pbl6.flashcard.service.LearningPathScheduler.ChapterPlan;
import com.pbl6.flashcard.service.LearningPathScheduler.DayPlan;
import com.pbl6.flashcard.service.LearningPathScheduler.DayRange;
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
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Lộ trình học tập: tạo (job bóc tách purpose = learning_path), dựng bản nháp chương khi job xong, đọc lịch ngày.
 * Không inject vào ExtractionWorker (vòng phụ thuộc): nhận kết quả qua {@link ExtractionJobFinishedEvent}.
 */
@Service
public class LearningPathService {

    private static final Logger log = LoggerFactory.getLogger(LearningPathService.class);
    private static final String NOT_FOUND = "Không tìm thấy lộ trình học.";
    private static final int MAX_TITLE = 100;

    private final LearningPathRepository paths;
    private final LearningPathChapterRepository chapters;
    private final ExtractionJobRepository jobs;
    private final ExtractionItemRepository items;
    private final ExtractionService extraction;
    // Dùng khi kích hoạt lộ trình (tạo thư mục + bộ thẻ)
    private final DeckService deckService;
    private final FolderService folderService;
    private final FolderRepository folders;
    private final UserRepository users;
    private final TransactionTemplate tx;
    private final String zone;

    public LearningPathService(LearningPathRepository paths, LearningPathChapterRepository chapters,
                               ExtractionJobRepository jobs, ExtractionItemRepository items,
                               ExtractionService extraction, DeckService deckService, FolderService folderService,
                               FolderRepository folders, UserRepository users, PlatformTransactionManager txm,
                               @Value("${app.learning-path.zone:Asia/Ho_Chi_Minh}") String zone) {
        this.paths = paths;
        this.chapters = chapters;
        this.jobs = jobs;
        this.items = items;
        this.extraction = extraction;
        this.deckService = deckService;
        this.folderService = folderService;
        this.folders = folders;
        this.users = users;
        this.tx = new TransactionTemplate(txm);
        this.zone = zone;
    }

    /** Ngày "hôm nay" theo máy khách (?date=) hoặc theo múi giờ cấu hình. */
    public LocalDate today(LocalDate date) {
        return date != null ? date : LocalDate.now(ZoneId.of(zone));
    }

    // ---------- tạo ----------

    /** Không @Transactional: job + path phải được commit trước khi worker (thread khác) chạy. */
    public LearningPathResponse create(User user, byte[] data, String filename, String text, Integer days,
                                       String title, LocalDate startDate, String optionsJson) {
        if (days == null || days < 1 || days > 365) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Số ngày học phải từ 1 đến 365.");
        }
        ExtractionOptions options = extraction.parseOptions(optionsJson)
                .withDefaults(user.getJlptLevel()).withSplitChapters(true);
        ExtractionJob job = extraction.prepareJob(user, data, filename, text, options, ExtractionJob.PURPOSE_LEARNING_PATH);

        LearningPath path = new LearningPath();
        path.setId(UUID.randomUUID());
        path.setUserId(user.getId());
        path.setStatus(LearningPath.PROCESSING);
        path.setJobId(job.getId());
        path.setSourceType(job.getSourceType());
        path.setSourceName(job.getSourceName());
        path.setTitle(pathTitle(title, filename));
        path.setStartDate(startDate != null ? startDate : today(null));
        path.setTotalDays(days);
        path.setCreatedAt(Instant.now());
        paths.save(path);

        try {
            extraction.startJob(job, data, filename, text);
        } catch (ResponseStatusException e) {
            path.setStatus(LearningPath.FAILED);
            path.setErrorMessage(ExtractionWorker.cut(e.getReason(), 500));
            paths.save(path);
            throw e;
        }
        return toResponse(path, today(null), false);
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
            p.setStatus(LearningPath.FAILED);
            p.setErrorMessage(ExtractionWorker.cut(message, 500));
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
        Map<String, Object> stats = job.getStats() != null ? job.getStats() : Map.of();
        boolean detected = Boolean.TRUE.equals(stats.get("chaptersDetected"));
        if (detected) {
            draftFromStats(path, stats.get("chapters"), all);
        } else {
            draftByDays(path, all);
        }
        path.setChaptersDetected(detected);
        path.setStatus(LearningPath.DRAFT);
        path.setErrorMessage(null);
    }

    private static void fail(LearningPath path, String message) {
        path.setStatus(LearningPath.FAILED);
        path.setErrorMessage(ExtractionWorker.cut(message, 500));
    }

    /** Chương theo stats.chapters của ai-service; item thiếu / lạ số chương -> chương đầu. */
    private void draftFromStats(LearningPath path, Object raw, List<ExtractionItem> all) {
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
        chapters.saveAll(rows);
        UUID first = rows.get(0).getId();
        for (ExtractionItem i : all) {
            i.setChapterId(i.getChapterNo() != null ? byNo.getOrDefault(i.getChapterNo(), first) : first);
        }
    }

    /**
     * Không nhận ra chương: ≤ 14 ngày -> mỗi ngày một chương, dài hơn -> mỗi tuần một chương.
     * Chia theo item được chọn để tên chương khớp dải ngày tính sống; item bỏ chọn theo item được chọn đứng trước.
     */
    private void draftByDays(LearningPath path, List<ExtractionItem> all) {
        int days = path.getTotalDays();
        int selected = (int) all.stream().filter(ExtractionItem::isSelected).count();
        if (selected == 0) {
            // không còn thẻ chọn: một chương chứa tất cả, người dùng tự chọn lại trong bản nháp
            LearningPathChapter only = newChapter(path, 1, "Ngày 1");
            chapters.save(only);
            all.forEach(i -> i.setChapterId(only.getId()));
            return;
        }
        int k = days <= 14 ? days : (int) Math.ceil(days / 7.0);
        k = Math.min(k, selected);
        List<Integer> sizes = LearningPathScheduler.evenSplit(selected, k);
        List<DayRange> ranges = LearningPathScheduler.allocate(sizes, days);
        List<LearningPathChapter> rows = new ArrayList<>();
        for (int i = 0; i < k; i++) {
            DayRange r = ranges.get(i);
            String title = days <= 14 ? "Ngày " + r.dayFrom()
                    : "Tuần " + (i + 1) + " (ngày " + r.dayFrom() + "–" + r.dayTo() + ")";
            rows.add(newChapter(path, i + 1, title));
        }
        chapters.saveAll(rows);
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
    }

    private static LearningPathChapter newChapter(LearningPath path, int position, String title) {
        LearningPathChapter c = new LearningPathChapter();
        c.setId(UUID.randomUUID());
        c.setPathId(path.getId());
        c.setPosition(position);
        c.setTitle(title);
        return c;
    }

    /** Khởi động lại: worker trong RAM đã mất -> lộ trình đang xử lý coi như thất bại. */
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void failOrphans() {
        int n = paths.failProcessing("Máy chủ đã khởi động lại trong lúc xử lý. Hãy tạo lại lộ trình.");
        if (n > 0) log.warn("Đánh dấu {} lộ trình dở dang là FAILED sau khi khởi động", n);
    }

    // ---------- đọc ----------

    LearningPath owned(Long uid, UUID id) {
        return paths.findByIdAndUserId(id, uid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public List<LearningPathResponse> list(Long uid, LocalDate today) {
        return paths.findByUserIdOrderByCreatedAtDesc(uid).stream().map(p -> toResponse(p, today, false)).toList();
    }

    @Transactional(readOnly = true)
    public LearningPathResponse get(Long uid, UUID id, LocalDate today) {
        return toResponse(owned(uid, id), today, true);
    }

    LearningPathResponse toResponse(LearningPath p, LocalDate today, boolean full) {
        JobSummary job = p.getJobId() == null ? null : jobs.findById(p.getJobId())
                .map(j -> new JobSummary(j.getStatus(), j.getStage(), j.getErrorMessage(), j.getStats()))
                .orElse(null);
        boolean draft = LearningPath.DRAFT.equals(p.getStatus());
        boolean active = LearningPath.ACTIVE.equals(p.getStatus());

        List<LearningPathChapterResponse> chapterDtos = null;
        List<DayPlan> days = null;
        Today todayDto = null;
        if (active || (full && draft)) {
            List<LearningPathChapter> rows = chapters.findByPathIdOrderByPositionAsc(p.getId());
            // [số thẻ chọn, từ vựng, ngữ pháp] theo chương
            Map<UUID, int[]> counts = new HashMap<>();
            if (p.getJobId() != null && (draft || full)) {
                for (ExtractionItem i : items.findByJobIdOrderByPositionAsc(p.getJobId())) {
                    if (!i.isSelected() || i.getChapterId() == null) continue;
                    int[] c = counts.computeIfAbsent(i.getChapterId(), k -> new int[3]);
                    c[0]++;
                    if (ExtractionItem.GRAMMAR.equals(i.getKind())) c[2]++; else c[1]++;
                }
            }
            List<Integer> cardCounts = new ArrayList<>();
            List<DayRange> ranges = new ArrayList<>();
            for (LearningPathChapter c : rows) {
                if (draft) {
                    cardCounts.add(counts.getOrDefault(c.getId(), new int[3])[0]);
                } else {
                    cardCounts.add(c.getCardCount() != null ? c.getCardCount() : 0);
                    ranges.add(c.getDayFrom() != null && c.getDayTo() != null
                            ? new DayRange(c.getDayFrom(), c.getDayTo()) : null);
                }
            }
            if (draft) ranges = LearningPathScheduler.allocate(cardCounts, p.getTotalDays());

            List<ChapterPlan> plans = new ArrayList<>();
            List<LearningPathChapterResponse> dtos = new ArrayList<>();
            for (int idx = 0; idx < rows.size(); idx++) {
                LearningPathChapter c = rows.get(idx);
                int cards = cardCounts.get(idx);
                DayRange r = ranges.get(idx);
                int[] kc = counts.getOrDefault(c.getId(), new int[3]);
                int perDay = r != null ? LearningPathScheduler.perDay(cards, r) : 0;
                if (r != null) plans.add(new ChapterPlan(c.getId(), c.getTitle(), c.getDeckId(), cards, r));
                dtos.add(new LearningPathChapterResponse(c.getId(), c.getPosition(), c.getTitle(), c.getDeckId(),
                        active && c.getDeckId() == null, cards, kc[1], kc[2],
                        r != null ? r.dayFrom() : null, r != null ? r.dayTo() : null, perDay));
            }
            if (full) {
                chapterDtos = dtos;
                days = LearningPathScheduler.schedule(plans, p.getStartDate(), p.getTotalDays());
            }
            if (active) {
                LocalDate date = today(today);
                int dayIndex = LearningPathScheduler.dayIndex(p.getStartDate(), date);
                String state = dayIndex < 1 ? "before" : dayIndex > p.getTotalDays() ? "after" : "during";
                todayDto = new Today(date, dayIndex, state, LearningPathScheduler.tasksFor(plans, dayIndex));
            }
        }
        return new LearningPathResponse(p.getId(), p.getTitle(), p.getStatus(), p.getSourceType(), p.getSourceName(),
                p.getTotalDays(), p.getStartDate(), p.getChaptersDetected(), p.getJobId(), p.getFolderId(),
                p.getCreatedAt(), p.getActivatedAt(), p.getErrorMessage(), job, chapterDtos, todayDto, days);
    }
}
