package com.pbl6.flashcard.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.admin.AdminQuestionDtos.Detail;
import com.pbl6.flashcard.dto.admin.AdminQuestionDtos.Flag;
import com.pbl6.flashcard.dto.admin.AdminQuestionDtos.Patch;
import com.pbl6.flashcard.dto.admin.AdminQuestionDtos.Row;
import com.pbl6.flashcard.dto.deck.QuestionFlagDtos;
import com.pbl6.flashcard.model.Deck;
import com.pbl6.flashcard.model.Flashcard;
import com.pbl6.flashcard.model.QuestionFlag;
import com.pbl6.flashcard.model.QuizQuestion;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.DeckRepository;
import com.pbl6.flashcard.repository.FlashcardRepository;
import com.pbl6.flashcard.repository.QuestionFlagRepository;
import com.pbl6.flashcard.repository.QuizQuestionRepository;
import com.pbl6.flashcard.security.QuestionFlagRateLimiter;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Ngân hàng câu hỏi quiz (D11, hợp đồng đợt 2 §1): nạp / ghi câu khi phát đề (QuizAttemptService), người học báo lỗi câu, admin
 * xem / sửa / ẩn câu và đóng báo lỗi (G3, mỗi thao tác ghi một dòng audit trong cùng transaction, target QUESTION).
 * <p>
 * Dòng mới ghi bằng JDBC "INSERT ... ON CONFLICT DO NOTHING" chứ không qua JPA: unique theo nội dung (card_id, kind,
 * md5(prompt || options)) va chạm khi hai lượt làm song song sinh cùng một câu — DO NOTHING không làm hỏng transaction của
 * lượt làm như một DataIntegrityViolationException, và RETURNING cho id ngay trong một câu lệnh.
 */
@Service
public class QuestionBankService {

    /** target_type trong admin_audit_logs của mọi thao tác ở đây (kể cả đóng báo lỗi: gom theo câu hỏi). */
    public static final String AUDIT_TARGET = "QUESTION";
    /** prompt / correct là varchar(500): câu sinh ra dài hơn (nghĩa một dòng rất dài) vẫn được phát nhưng không vào ngân hàng. */
    private static final int TEXT_MAX = 500;
    private static final int MIN_OPTIONS = 2;
    private static final int MAX_OPTIONS = 8;
    private static final String NOT_FOUND = "Không tìm thấy câu hỏi.";

    /**
     * Thứ tự ghi cố định: hai lượt làm song song ghi cùng các câu theo cùng thứ tự, nên chờ khoá unique của nhau theo một chiều
     * và không bao giờ deadlock.
     */
    private static final Comparator<QuizService.Built> WRITE_ORDER = Comparator
            .comparing((QuizService.Built b) -> b.draft().cardId())
            .thenComparing(b -> b.draft().kind())
            .thenComparing(b -> b.draft().prompt())
            .thenComparing(b -> String.valueOf(b.draft().options()));

    private static final String INSERT_QUESTION = """
            INSERT INTO quiz_questions (id, card_id, deck_id, kind, prompt, options, correct, extra, generator)
            VALUES (:id, :cardId, :deckId, :kind, :prompt, CAST(:options AS jsonb), :correct, CAST(:extra AS jsonb), :generator)
            ON CONFLICT DO NOTHING
            RETURNING id
            """;
    /** Cùng biểu thức với index uq_quiz_questions_content -> dùng được index đó. */
    private static final String FIND_QUESTION = """
            SELECT id, status FROM quiz_questions
            WHERE card_id = :cardId AND kind = :kind
              AND md5(prompt || coalesce(options::text, '')) = md5(CAST(:prompt AS text) || coalesce(CAST(CAST(:options AS text) AS jsonb)::text, ''))
            """;
    /** Dòng cũ cùng nội dung nhưng sinh từ thẻ trước khi sửa: đáp án theo thẻ mới, không còn là bản admin sửa. */
    private static final String REFRESH_QUESTION = """
            UPDATE quiz_questions SET correct = :correct, extra = CAST(:extra AS jsonb), edited_by = NULL, updated_at = now()
            WHERE id = :id AND status = 'ACTIVE'
            """;
    private static final String INSERT_FLAG = """
            INSERT INTO question_flags (question_id, user_id, reason, detail)
            VALUES (:questionId, :userId, :reason, :detail)
            ON CONFLICT DO NOTHING
            RETURNING id
            """;

    private final QuizQuestionRepository questions;
    private final QuestionFlagRepository flags;
    private final DeckRepository decks;
    private final FlashcardRepository flashcards;
    private final DeckService deckService;
    private final AuditService audit;
    private final QuestionFlagRateLimiter rateLimiter;
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json;

    public QuestionBankService(QuizQuestionRepository questions, QuestionFlagRepository flags, DeckRepository decks,
                               FlashcardRepository flashcards, DeckService deckService, AuditService audit,
                               QuestionFlagRateLimiter rateLimiter, NamedParameterJdbcTemplate jdbc, ObjectMapper json) {
        this.questions = questions;
        this.flags = flags;
        this.decks = decks;
        this.flashcards = flashcards;
        this.deckService = deckService;
        this.audit = audit;
        this.rateLimiter = rateLimiter;
        this.jdbc = jdbc;
        this.json = json;
    }

    // ---------- ngân hàng cho lượt làm (QuizAttemptService) ----------

    /**
     * Câu đã có của bộ thẻ cho các loại sắp phát + meaning (loại dự phòng của mọi thẻ), theo cardId, gồm cả câu đã ẩn (để
     * bước sinh đề tránh sinh lại đúng câu đó). Chạy trong transaction phát đề.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Map<String, List<QuizService.BankEntry>> load(String deckId, Collection<String> types) {
        Set<String> kinds = new HashSet<>();
        kinds.add(QuizService.kind(QuizService.MEANING));
        for (String t : types) kinds.add(QuizService.kind(t));
        Map<String, List<QuizService.BankEntry>> out = new HashMap<>();
        for (QuizQuestion q : questions.findByDeckIdAndKindIn(deckId, kinds)) {
            out.computeIfAbsent(q.getCardId(), k -> new ArrayList<>()).add(new QuizService.BankEntry(q.getId().toString(),
                    q.getCardId(), q.getKind(), q.getPrompt(), q.getOptions(), q.getCorrect(), q.getExtra(),
                    QuizQuestion.HIDDEN.equals(q.getStatus())));
        }
        return out;
    }

    /**
     * Ghi các câu vừa sinh vào ngân hàng và gắn questionId vào câu của lượt làm. Câu trùng nội dung một dòng đã có thì dùng id
     * dòng đó; dòng đó hoá ra đã bị ẩn (admin vừa ẩn sau lúc nạp ngân hàng) thì bỏ câu khỏi lượt làm — không bao giờ phát câu
     * đã ẩn. Câu quá dài cho cột (prompt / correct > 500) vẫn phát nhưng không có questionId (không báo lỗi được).
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public List<QuizService.Item> persist(String deckId, List<QuizService.Built> built) {
        Map<QuizService.Built, String> ids = new IdentityHashMap<>();
        Set<QuizService.Built> dropped = Collections.newSetFromMap(new IdentityHashMap<>());
        Set<QuizService.Built> unstored = Collections.newSetFromMap(new IdentityHashMap<>());
        List<QuizService.Built> writes = new ArrayList<>();
        for (QuizService.Built b : built) {
            if (b.draft() == null) continue;
            if (storable(b.draft())) writes.add(b);
            else unstored.add(b);
        }
        writes.sort(WRITE_ORDER);
        for (QuizService.Built b : writes) {
            QuizService.Draft d = b.draft();
            if (d.refreshId() != null) {
                if (refresh(d)) ids.put(b, d.refreshId());
                else dropped.add(b);
                continue;
            }
            Stored row = insertOrFind(deckId, d);
            if (row == null) unstored.add(b); // không đọc lại được dòng vừa va chạm (không xảy ra): phát, không gắn id
            else if (row.hidden()) dropped.add(b);
            else ids.put(b, row.id());
        }
        List<QuizService.Item> out = new ArrayList<>(built.size());
        for (QuizService.Built b : built) {
            if (dropped.contains(b)) continue;
            if (unstored.contains(b)) out.add(b.item().withQuestionId(null));
            else out.add(ids.containsKey(b) ? b.item().withQuestionId(ids.get(b)) : b.item());
        }
        return out;
    }

    private record Stored(String id, boolean hidden) {}

    private static boolean storable(QuizService.Draft d) {
        return d.prompt() != null && !d.prompt().isEmpty() && d.prompt().length() <= TEXT_MAX
                && d.correct() != null && !d.correct().isEmpty() && d.correct().length() <= TEXT_MAX;
    }

    private Stored insertOrFind(String deckId, QuizService.Draft d) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("id", UUID.randomUUID())
                .addValue("cardId", d.cardId())
                .addValue("deckId", deckId)
                .addValue("kind", d.kind())
                .addValue("prompt", d.prompt(), Types.VARCHAR)
                .addValue("options", d.options() == null ? null : write(d.options()), Types.VARCHAR)
                .addValue("correct", d.correct())
                .addValue("extra", d.extra() == null ? null : write(d.extra()), Types.VARCHAR)
                .addValue("generator", d.generator());
        List<UUID> inserted = jdbc.query(INSERT_QUESTION, p, (rs, i) -> rs.getObject(1, UUID.class));
        if (!inserted.isEmpty()) return new Stored(inserted.get(0).toString(), false);
        // Câu lệnh mới = ảnh chụp mới (READ COMMITTED): thấy cả dòng mà lượt song song vừa commit làm INSERT trên va chạm
        List<Stored> existing = jdbc.query(FIND_QUESTION, p, (rs, i) -> new Stored(rs.getObject("id", UUID.class).toString(),
                QuizQuestion.HIDDEN.equals(rs.getString("status"))));
        return existing.isEmpty() ? null : existing.get(0);
    }

    private boolean refresh(QuizService.Draft d) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("id", UUID.fromString(d.refreshId()))
                .addValue("correct", d.correct())
                .addValue("extra", d.extra() == null ? null : write(d.extra()), Types.VARCHAR);
        return jdbc.update(REFRESH_QUESTION, p) > 0;
    }

    // ---------- người học báo lỗi ----------

    /**
     * Báo lỗi một câu hỏi: chỉ người xem được bộ thẻ của câu (học / làm quiz được) mới báo được — không xem được = 404 như câu
     * không tồn tại. Một báo lỗi OPEN mỗi người mỗi câu (409), quá 20 lần / giờ = 429. flag_count (tổng số lần câu bị báo
     * lỗi, không giảm khi đóng) tăng cùng transaction.
     */
    @Transactional
    public QuestionFlagDtos.Created flag(Long uid, UUID questionId, QuestionFlagDtos.Request req) {
        String detail = trimToNull(req.detail());
        if (req.reason() == QuestionFlagDtos.Reason.OTHER && detail == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hãy mô tả lỗi của câu hỏi.");
        }
        QuizQuestion q = questions.findById(questionId).orElseThrow(QuestionBankService::notFound);
        try {
            deckService.readable(uid, q.getDeckId());
        } catch (ResponseStatusException e) {
            throw notFound();
        }
        rateLimiter.check(uid);
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("questionId", questionId)
                .addValue("userId", uid)
                .addValue("reason", req.reason().name())
                .addValue("detail", detail, Types.VARCHAR);
        List<Long> ids = jdbc.query(INSERT_FLAG, p, (rs, i) -> rs.getLong(1));
        if (ids.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bạn đã báo lỗi câu hỏi này, quản trị viên đang xem xét.");
        }
        jdbc.update("UPDATE quiz_questions SET flag_count = flag_count + 1 WHERE id = :id",
                new MapSqlParameterSource("id", questionId));
        return new QuestionFlagDtos.Created(ids.get(0), QuestionFlag.OPEN);
    }

    /** Số báo lỗi câu hỏi đang OPEN (thống kê admin: openQuestionFlags). */
    public long countOpenFlags() {
        return flags.countByStatus(QuestionFlag.OPEN);
    }

    // ---------- admin ----------

    /** flagged: câu đang bị báo lỗi nhiều nhất trước; còn lại: câu vừa đổi trước. */
    @Transactional(readOnly = true)
    public AdminPage<Row> list(String deckId, String kind, boolean flagged, String status, String q, int page, int size) {
        Sort sort = flagged
                ? Sort.by(Sort.Order.desc("flagCount"), Sort.Order.desc("updatedAt"), Sort.Order.asc("id"))
                : Sort.by(Sort.Order.desc("updatedAt"), Sort.Order.asc("id"));
        Page<QuizQuestion> p = questions.search(trimToNull(deckId), kind, status, flagged, AdminUserService.likePattern(q),
                PageRequest.of(page, size, sort));
        return AdminPage.of(p, rows(p.getContent()));
    }

    @Transactional(readOnly = true)
    public Detail detail(UUID id) {
        return detail(questions.findById(id).orElseThrow(QuestionBankService::notFound));
    }

    /**
     * Sửa nội dung câu (trường null = giữ nguyên). Phương án lưu đã sắp xếp như câu máy sinh để unique theo nội dung vẫn đúng;
     * trùng nội dung một câu khác của cùng thẻ = 409. Không đổi gì = không ghi, không audit. Câu đã sửa (edited_by) được bước
     * phát đề dùng lại thay vì sinh câu mới, tới khi nội dung thẻ đổi: sửa đáp án thì nội dung sinh lại vẫn khớp dòng này; sửa
     * prompt / phương án thì nội dung gốc được ghi vào extra.supersedes ({@link #supersedingExtra}) để sinh lại vẫn về dòng này.
     */
    @Transactional
    public Detail patch(User actor, UUID id, Patch body) {
        QuizQuestion q = questions.findForUpdate(id).orElseThrow(QuestionBankService::notFound);
        boolean typing = QuizQuestion.KIND_READING.equals(q.getKind());

        String prompt = body.prompt() == null ? q.getPrompt() : body.prompt().strip();
        if (prompt.isEmpty()) throw badRequest("Câu hỏi không được để trống.");

        List<String> options = null;
        if (typing) {
            if (body.options() != null && !body.options().isEmpty()) {
                throw badRequest("Câu gõ cách đọc không có phương án lựa chọn.");
            }
        } else {
            List<String> raw = body.options() == null ? q.getOptions() : body.options().stream().map(String::strip).toList();
            if (raw == null || raw.size() < MIN_OPTIONS || raw.size() > MAX_OPTIONS) {
                throw badRequest("Câu hỏi cần từ " + MIN_OPTIONS + " đến " + MAX_OPTIONS + " phương án.");
            }
            if (raw.stream().anyMatch(String::isEmpty)) throw badRequest("Phương án không được để trống.");
            if (new LinkedHashSet<>(raw).size() != raw.size()) throw badRequest("Các phương án bị trùng nhau.");
            options = raw.stream().sorted().toList();
        }

        String correct = body.correct() == null ? q.getCorrect() : body.correct().strip();
        if (correct.isEmpty()) throw badRequest("Đáp án đúng không được để trống.");
        if (!typing && !options.contains(correct)) throw badRequest("Đáp án đúng phải là một trong các phương án.");
        if (typing && QuizService.typingAnswers(correct).isEmpty()) {
            throw badRequest("Đáp án của câu gõ phải có ít nhất một chữ kana hoặc chữ cái.");
        }

        Map<String, Object> diff = new HashMap<>();
        boolean promptChanged = !prompt.equals(q.getPrompt());
        if (promptChanged) diff.putAll(AuditService.diff("prompt", q.getPrompt(), prompt));
        List<String> before = q.getOptions() == null || q.getOptions().isEmpty() ? null : q.getOptions();
        boolean optionsChanged = !Objects.equals(options, before == null ? null : before.stream().sorted().toList());
        if (optionsChanged) diff.putAll(AuditService.diff("options", before, options));
        if (!correct.equals(q.getCorrect())) diff.putAll(AuditService.diff("correct", q.getCorrect(), correct));
        if (diff.isEmpty()) return detail(q);

        if (promptChanged || optionsChanged) q.setExtra(supersedingExtra(q, prompt, options));
        q.setPrompt(prompt);
        q.setOptions(options);
        q.setCorrect(correct);
        q.setEditedBy(actor.getId());
        q.setUpdatedAt(Instant.now());
        try {
            questions.saveAndFlush(q);
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Thẻ này đã có một câu hỏi cùng loại giống hệt nội dung vừa sửa.");
        }
        audit.log(actor.getId(), "QUESTION_EDIT", AUDIT_TARGET, id.toString(), diff);
        return detail(q);
    }

    /**
     * extra mới khi admin đổi prompt / phương án: thêm khoá nội dung TRƯỚC khi sửa vào extra.supersedes. Unique của ngân hàng
     * theo nội dung, nên thiếu bước này thì lần phát đề sau sinh lại đúng nội dung gốc (câu chọn đúng chữ với ≤ 3 ứng viên luôn
     * ra cùng một bộ phương án, prompt câu gõ / câu nghĩa cố định), không khớp dòng đã sửa và được ghi thành dòng mới — câu bị báo
     * lỗi quay lại. Khoá của chính nội dung mới bị bỏ khỏi danh sách (admin sửa ngược về bản gốc). Các khoá khác (cardHash...)
     * giữ nguyên: bản sửa hết hiệu lực khi thẻ đổi nội dung, như đáp án admin sửa.
     */
    private static Map<String, Object> supersedingExtra(QuizQuestion q, String prompt, List<String> options) {
        Map<String, Object> extra = q.getExtra() == null ? new LinkedHashMap<>() : new LinkedHashMap<>(q.getExtra());
        Set<String> keys = new LinkedHashSet<>(QuizService.supersededKeys(extra));
        keys.add(QuizService.contentKey(q.getPrompt(), q.getOptions()));
        keys.remove(QuizService.contentKey(prompt, options));
        extra.put(QuizService.EXTRA_SUPERSEDES, List.copyOf(keys));
        return extra;
    }

    /**
     * Ẩn / hiện lại câu. Câu ẩn không bao giờ được phát nữa (bước phát đề sinh câu khác cho thẻ đó); lượt làm đang mở giữ nguyên
     * bản chụp đề. Đã đúng trạng thái = không ghi, không audit.
     */
    @Transactional
    public Detail setHidden(User actor, UUID id, boolean hidden) {
        QuizQuestion q = questions.findForUpdate(id).orElseThrow(QuestionBankService::notFound);
        String target = hidden ? QuizQuestion.HIDDEN : QuizQuestion.ACTIVE;
        if (!target.equals(q.getStatus())) {
            String before = q.getStatus();
            q.setStatus(target);
            q.setUpdatedAt(Instant.now());
            questions.saveAndFlush(q);
            audit.log(actor.getId(), hidden ? "QUESTION_HIDE" : "QUESTION_UNHIDE", AUDIT_TARGET, id.toString(),
                    AuditService.diff("status", before, target));
        }
        return detail(q);
    }

    /** Đóng một báo lỗi (atomic: UPDATE ... WHERE status = 'OPEN'); đã đóng = 409. Audit gom theo câu hỏi (target QUESTION). */
    @Transactional
    public Flag resolve(User actor, Long flagId, String note) {
        QuestionFlag f = flags.findById(flagId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy báo lỗi."));
        String trimmed = trimToNull(note);
        if (flags.resolve(flagId, trimmed, actor.getId(), Instant.now()) == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Báo lỗi này đã được xử lý.");
        }
        Map<String, Object> detail = new HashMap<>();
        detail.put("flagId", flagId);
        detail.put("note", trimmed);
        audit.log(actor.getId(), "QUESTION_FLAG_RESOLVE", AUDIT_TARGET, f.getQuestionId().toString(), detail);
        QuestionFlag after = flags.findById(flagId).orElseThrow();
        return Flag.of(after, audit.emailsOf(List.of(after.getUserId())).get(after.getUserId()));
    }

    // ---------- dựng response ----------

    private Detail detail(QuizQuestion q) {
        List<QuestionFlag> list = flags.findByQuestionIdOrderByCreatedAtDescIdDesc(q.getId());
        Map<Long, String> emails = audit.emailsOf(list.stream().map(QuestionFlag::getUserId).distinct().toList());
        return new Detail(rows(List.of(q)).get(0), list.stream().map(f -> Flag.of(f, emails.get(f.getUserId()))).toList());
    }

    /** Tên bộ thẻ, thuật ngữ của thẻ và số báo lỗi OPEN cho cả trang: mỗi thứ một truy vấn. */
    private List<Row> rows(List<QuizQuestion> page) {
        if (page.isEmpty()) return List.of();
        Map<String, String> titles = new HashMap<>();
        for (Deck d : decks.findAllById(page.stream().map(QuizQuestion::getDeckId).distinct().toList())) {
            titles.put(d.getId(), d.getTitle());
        }
        Map<String, String> terms = new HashMap<>();
        for (Flashcard c : flashcards.findAllById(page.stream().map(QuizQuestion::getCardId).distinct().toList())) {
            terms.put(c.getId(), c.getTerm());
        }
        Map<UUID, Long> open = new HashMap<>();
        for (QuestionFlagRepository.QuestionCount c : flags.countOpenByQuestionIds(page.stream().map(QuizQuestion::getId).toList())) {
            open.put(c.getQuestionId(), c.getN());
        }
        return page.stream().map(q -> Row.of(q, titles.get(q.getDeckId()), terms.get(q.getCardId()),
                open.getOrDefault(q.getId(), 0L))).toList();
    }

    // ---------- tiện ích ----------

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND);
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static String trimToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
