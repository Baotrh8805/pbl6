package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.mnemonic.MnemonicDtos.AdminItem;
import com.pbl6.flashcard.dto.mnemonic.MnemonicDtos.Approved;
import com.pbl6.flashcard.dto.mnemonic.MnemonicDtos.GenerateResponse;
import com.pbl6.flashcard.dto.mnemonic.MnemonicDtos.Generated;
import com.pbl6.flashcard.dto.mnemonic.MnemonicDtos.KanjiMnemonicsResponse;
import com.pbl6.flashcard.dto.mnemonic.MnemonicDtos.Mine;
import com.pbl6.flashcard.dto.mnemonic.MnemonicDtos.RadicalRef;
import com.pbl6.flashcard.model.KanjiMnemonic;
import com.pbl6.flashcard.model.Notification;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.KanjiMnemonicRepository;
import com.pbl6.flashcard.security.MnemonicRateLimiter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Mẹo nhớ chữ Hán + kiểm duyệt (C4/G2, hợp đồng đợt 2 §4). Người học sinh mẹo bằng ai-service (Gemini, dự phòng câu mẫu) hoặc tự
 * viết; mọi mẹo vào PENDING và chỉ hiện công khai (thẻ bộ thủ ở NlpService) sau khi admin duyệt. Mỗi chữ tối đa một mẹo APPROVED:
 * duyệt mẹo mới hạ mẹo cũ xuống REJECTED trong cùng transaction. Mọi thao tác ghi của admin sinh đúng một dòng audit và báo kết quả
 * cho tác giả trong cùng transaction (rollback thì cả hai biến mất).
 */
@Service
public class MnemonicService {

    private static final Logger log = LoggerFactory.getLogger(MnemonicService.class);

    private static final String AUDIT_TARGET = "MNEMONIC";
    static final String REPLACED_NOTE = "Thay bằng mẹo mới";
    /** Mẹo PENDING tối đa của một người cho một chữ: chặn spam hàng chờ duyệt. */
    static final int MAX_PENDING_PER_KANJI = 3;
    /**
     * Mẹo PENDING tối đa của một người (mọi chữ cộng lại): hơn 20 000 chữ Hán hợp lệ nên chỉ trần theo chữ không chặn được một vòng
     * lặp làm ngập hàng chờ duyệt của admin. 50 đủ cho người học thật (lô sinh mẹo ≤ 30 chữ) chờ admin duyệt.
     */
    static final int MAX_PENDING_PER_USER = 50;
    /** ai-service không trả tên model đã viết mẹo (có thể là model dự phòng) nên chỉ ghi họ model. */
    private static final String GEMINI = "gemini";
    private static final int MAX_STORED_CHARS = 500;
    private static final String NOT_FOUND = "Không tìm thấy mẹo nhớ.";
    private static final String ALREADY_REVIEWED = "Mẹo nhớ đã được xử lý.";

    private final KanjiMnemonicRepository repo;
    private final ContentAiClient ai;
    private final NlpService nlp;
    private final AuditService audit;
    private final NotificationService notifications;
    private final MnemonicRateLimiter limiter;
    private final TransactionTemplate tx;

    public MnemonicService(KanjiMnemonicRepository repo, ContentAiClient ai, NlpService nlp, AuditService audit,
                           NotificationService notifications, MnemonicRateLimiter limiter,
                           PlatformTransactionManager txManager) {
        this.repo = repo;
        this.ai = ai;
        this.nlp = nlp;
        this.audit = audit;
        this.notifications = notifications;
        this.limiter = limiter;
        this.tx = new TransactionTemplate(txManager);
    }

    // ---------- người học ----------

    /** Mẹo công khai của chữ + mọi mẹo của chính mình (kể cả bị từ chối, để thấy lý do). */
    @Transactional(readOnly = true)
    public KanjiMnemonicsResponse forKanji(Long userId, String rawKanji) {
        String ch = requireKanji(rawKanji);
        Approved approved = repo.findByKanjiAndStatus(ch, KanjiMnemonic.APPROVED).map(Approved::of).orElse(null);
        List<Mine> mine = repo.findByCreatedByAndKanjiOrderByCreatedAtDescIdAsc(userId, ch).stream().map(Mine::of).toList();
        return new KanjiMnemonicsResponse(ch, approved, mine);
    }

    /**
     * Sinh mẹo cho một lô chữ rồi lưu PENDING. Bỏ qua mục không phải một chữ Hán (như ai-service) và chữ mình đã có mẹo đang chờ
     * duyệt (bấm lại không đốt thêm quota Gemini). Hai chốt chống lạm dụng quota Gemini dùng chung, chỉ áp cho lượt thực sự gọi
     * ai-service: trần mẹo PENDING mỗi người (409, kiểm trước — không tốn lượt) rồi giới hạn tần suất theo người
     * ({@link MnemonicRateLimiter}, 429). Không @Transactional: không giữ kết nối DB trong lúc chờ Gemini; lưu cả lô bằng một saveAll
     * (một transaction). Hai lượt song song có thể cùng lọt trần PENDING (vượt tối đa một lô) — trần mềm, giới hạn tần suất chặn tiếp.
     */
    public GenerateResponse generate(Long userId, List<String> rawKanji) {
        List<String> chars = new ArrayList<>();
        for (String raw : rawKanji) {
            String ch = kanjiOrNull(raw);
            if (ch != null && !chars.contains(ch)) chars.add(ch);
        }
        if (!chars.isEmpty()) chars.removeAll(repo.pendingKanjiOf(userId, chars));
        if (chars.isEmpty()) return new GenerateResponse(List.of(), null);
        requirePendingRoom(userId, chars.size());
        limiter.check(userId);

        JsonNode res = NlpService.upstream(() -> ai.radicalCardsWithMnemonic(chars));
        List<KanjiMnemonic> rows = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode card : res.path("items")) {
            String ch = text(card.get("kanji"));
            String mnemonic = text(card.get("mnemonicVi"));
            if (ch == null || mnemonic == null || !chars.contains(ch) || !seen.add(ch)) continue;
            boolean gemini = GEMINI.equals(text(card.get("mnemonicSource")));
            JsonNode no = card.path("radical").path("no");
            Integer radicalNo = no.canConvertToInt() && no.asInt() >= 1 && no.asInt() <= NlpService.RADICAL_COUNT ? no.asInt() : null;
            rows.add(new KanjiMnemonic(ch, radicalNo, clip(mnemonic.strip()),
                    gemini ? KanjiMnemonic.SOURCE_AI : KanjiMnemonic.SOURCE_TEMPLATE, gemini ? GEMINI : null, userId));
        }
        List<Generated> items = repo.saveAll(rows).stream().map(Generated::of).toList();
        return new GenerateResponse(items, text(res.get("reason")));
    }

    /**
     * Mẹo tự viết (USER, PENDING); 409 khi đã có {@value #MAX_PENDING_PER_KANJI} mẹo chờ duyệt của mình cho chữ này, hoặc
     * {@value #MAX_PENDING_PER_USER} mẹo chờ duyệt tất cả.
     */
    @Transactional
    public Mine create(Long userId, String rawKanji, String mnemonicVi) {
        String ch = requireKanji(rawKanji);
        String body = mnemonicVi.strip();
        if (repo.countByCreatedByAndKanjiAndStatus(userId, ch, KanjiMnemonic.PENDING) >= MAX_PENDING_PER_KANJI) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bạn đã có " + MAX_PENDING_PER_KANJI + " mẹo nhớ đang chờ duyệt cho chữ " + ch + ".");
        }
        requirePendingRoom(userId, 1);
        // Bộ của chữ lấy từ mẹo do ai-service sinh trước đó (nếu có) để hàng chờ duyệt hiện được bộ, không gọi thêm ai-service
        Integer radicalNo = repo.findFirstByKanjiAndRadicalNoIsNotNullOrderByCreatedAtDesc(ch)
                .map(KanjiMnemonic::getRadicalNo).orElse(null);
        return Mine.of(repo.save(new KanjiMnemonic(ch, radicalNo, body, KanjiMnemonic.SOURCE_USER, null, userId)));
    }

    // ---------- admin ----------

    /** Không @Transactional: tên bộ thủ tra ai-service (có cache), không giữ kết nối DB trong lúc chờ. */
    public AdminPage<AdminItem> list(String status, String q, int page, int size) {
        Page<KanjiMnemonic> p = repo.search(status, AdminUserService.likePattern(q), PageRequest.of(page, size));
        return AdminPage.of(p, toAdminItems(p.getContent()));
    }

    /** Số mẹo chờ duyệt cho thẻ thống kê của dashboard admin (pendingMnemonics). */
    public long countPending() {
        return repo.countByStatus(KanjiMnemonic.PENDING);
    }

    public AdminItem edit(User actor, UUID id, String mnemonicVi) {
        String body = mnemonicVi.strip();
        tx.executeWithoutResult(s -> {
            KanjiMnemonic before = find(id);
            if (repo.editPending(id, body) == 0) throw alreadyReviewed();
            audit.log(actor.getId(), "MNEMONIC_EDIT", AUDIT_TARGET, id.toString(),
                    AuditService.diff("mnemonicVi", before.getMnemonicVi(), body));
        });
        return item(id);
    }

    /** Duyệt: hạ mẹo APPROVED cũ của chữ (nếu có) xuống REJECTED rồi duyệt mẹo này, cùng một transaction. */
    public AdminItem approve(User actor, UUID id, String note) {
        String cleanNote = blankToNull(note);
        tx.executeWithoutResult(s -> {
            KanjiMnemonic m = find(id);
            if (!KanjiMnemonic.PENDING.equals(m.getStatus())) throw alreadyReviewed();
            Instant now = Instant.now();
            UUID replaced = repo.findByKanjiAndStatus(m.getKanji(), KanjiMnemonic.APPROVED).map(KanjiMnemonic::getId).orElse(null);
            if (replaced != null) repo.retireApproved(replaced, REPLACED_NOTE, actor.getId(), now);
            // Điều kiện status = PENDING trong câu UPDATE là chốt thật (kiểm ở trên chỉ để báo sớm); hai admin duyệt hai mẹo
            // cùng chữ một lúc thì người sau chạm partial unique index -> DataIntegrityViolation -> 409 ở ApiExceptionHandler
            if (repo.reviewPending(id, KanjiMnemonic.APPROVED, cleanNote, actor.getId(), now) == 0) throw alreadyReviewed();
            Map<String, Object> detail = new HashMap<>();
            detail.put("kanji", m.getKanji());
            detail.put("note", cleanNote);
            detail.put("replacedId", replaced == null ? null : replaced.toString());
            audit.log(actor.getId(), "MNEMONIC_APPROVE", AUDIT_TARGET, id.toString(), detail);
            notifyAuthor(m, KanjiMnemonic.APPROVED, cleanNote);
        });
        return item(id);
    }

    public AdminItem reject(User actor, UUID id, String note) {
        String cleanNote = blankToNull(note);
        if (cleanNote == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hãy ghi lý do từ chối mẹo nhớ.");
        tx.executeWithoutResult(s -> {
            KanjiMnemonic m = find(id);
            if (repo.reviewPending(id, KanjiMnemonic.REJECTED, cleanNote, actor.getId(), Instant.now()) == 0) {
                throw alreadyReviewed();
            }
            Map<String, Object> detail = new HashMap<>();
            detail.put("kanji", m.getKanji());
            detail.put("note", cleanNote);
            audit.log(actor.getId(), "MNEMONIC_REJECT", AUDIT_TARGET, id.toString(), detail);
            notifyAuthor(m, KanjiMnemonic.REJECTED, cleanNote);
        });
        return item(id);
    }

    // ---------- nội bộ ----------

    /** 409 khi thêm {@code adding} mẹo PENDING sẽ vượt {@value #MAX_PENDING_PER_USER} mẹo chờ duyệt của người này. */
    private void requirePendingRoom(Long userId, int adding) {
        long pending = repo.countByCreatedByAndStatus(userId, KanjiMnemonic.PENDING);
        if (pending + adding <= MAX_PENDING_PER_USER) return;
        long room = Math.max(0, MAX_PENDING_PER_USER - pending);
        throw new ResponseStatusException(HttpStatus.CONFLICT, room == 0
                ? "Bạn đã có " + pending + " mẹo nhớ đang chờ duyệt (tối đa " + MAX_PENDING_PER_USER
                        + "). Hãy đợi quản trị duyệt bớt rồi gửi tiếp."
                : "Bạn đang có " + pending + " mẹo nhớ chờ duyệt (tối đa " + MAX_PENDING_PER_USER + "): chỉ gửi thêm được "
                        + room + " chữ.");
    }

    /** Tác giả bị xoá tài khoản (created_by SET NULL) thì không có ai để báo. */
    private void notifyAuthor(KanjiMnemonic m, String status, String note) {
        if (m.getCreatedBy() == null) return;
        Map<String, Object> payload = new HashMap<>();
        payload.put("kanji", m.getKanji());
        payload.put("status", status);
        payload.put("note", note);
        notifications.notify(m.getCreatedBy(), Notification.MNEMONIC_REVIEWED, payload);
    }

    private KanjiMnemonic find(UUID id) {
        return repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND));
    }

    private static ResponseStatusException alreadyReviewed() {
        return new ResponseStatusException(HttpStatus.CONFLICT, ALREADY_REVIEWED);
    }

    private AdminItem item(UUID id) {
        return toAdminItems(List.of(find(id))).get(0);
    }

    private List<AdminItem> toAdminItems(List<KanjiMnemonic> rows) {
        if (rows.isEmpty()) return List.of();
        Map<Long, String> emails = audit.emailsOf(rows.stream()
                .flatMap(m -> Stream.of(m.getCreatedBy(), m.getReviewedBy())).filter(Objects::nonNull).distinct().toList());
        Map<Integer, RadicalRef> radicals = rows.stream().anyMatch(m -> m.getRadicalNo() != null) ? radicalTable() : Map.of();
        return rows.stream().map(m -> AdminItem.of(m,
                m.getRadicalNo() == null ? null : radicals.getOrDefault(m.getRadicalNo(), new RadicalRef(m.getRadicalNo(), null, null)),
                m.getCreatedBy() == null ? null : emails.get(m.getCreatedBy()),
                m.getReviewedBy() == null ? null : emails.get(m.getReviewedBy()))).toList();
    }

    /**
     * Bảng 214 bộ của ai-service (NlpService cache 10 phút) -> {no: {no, char, nameVi}}; char là chữ CJK thống nhất như thẻ bộ thủ.
     * ai-service không chạy thì chỉ còn số bộ: hàng chờ duyệt không được hỏng vì thiếu tên bộ.
     */
    private Map<Integer, RadicalRef> radicalTable() {
        try {
            Map<Integer, RadicalRef> out = new HashMap<>();
            for (JsonNode r : nlp.radicals().path("items")) {
                if (!r.path("no").canConvertToInt()) continue;
                int no = r.get("no").asInt();
                String ch = text(r.get("unified")) != null ? text(r.get("unified")) : text(r.get("char"));
                out.put(no, new RadicalRef(no, ch, text(r.get("nameVi"))));
            }
            return out;
        } catch (ResponseStatusException e) {
            log.debug("Không tra được bảng bộ thủ cho hàng chờ mẹo nhớ: {}", e.getReason());
            return Map.of();
        }
    }

    /** 400 khi tham số không phải đúng một chữ Hán. */
    private static String requireKanji(String raw) {
        String ch = kanjiOrNull(raw);
        if (ch == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chỉ nhận đúng một chữ Hán.");
        return ch;
    }

    /**
     * Đúng một chữ Hán (CJK thống nhất + mở rộng A, chữ tương thích, mở rộng B trở đi như 𠮟); 々 〆 ヶ và kana bị loại như
     * KANJI_RE / _SKIP_CHARS của ai-service (không có bộ / âm riêng). null = không hợp lệ.
     */
    static String kanjiOrNull(String raw) {
        if (raw == null) return null;
        String s = raw.strip();
        if (s.isEmpty() || s.codePointCount(0, s.length()) != 1) return null;
        int cp = s.codePointAt(0);
        boolean han = (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0xF900 && cp <= 0xFAFF)
                || (cp >= 0x20000 && cp <= 0x3FFFF);
        return han ? s : null;
    }

    private static String text(JsonNode node) {
        return node != null && node.isTextual() && !node.asText().isBlank() ? node.asText() : null;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static String clip(String s) {
        return s.length() <= MAX_STORED_CHARS ? s : s.substring(0, MAX_STORED_CHARS);
    }
}
