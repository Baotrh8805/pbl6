package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.extraction.AiDtos;
import com.pbl6.flashcard.dto.extraction.AiDtos.AnalyzeResult;
import com.pbl6.flashcard.dto.extraction.AiDtos.TextResult;
import com.pbl6.flashcard.dto.knowledge.KnowledgeDtos;
import com.pbl6.flashcard.dto.knowledge.KnowledgeDtos.Detail;
import com.pbl6.flashcard.dto.knowledge.KnowledgeDtos.Entry;
import com.pbl6.flashcard.dto.knowledge.KnowledgeDtos.Item;
import com.pbl6.flashcard.model.KnowledgeSource;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.KnowledgeSourceRepository;
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

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Nguồn tri thức chuẩn (G4, hợp đồng đợt 2 §5): quản trị tải lên danh sách từ vựng / ngữ pháp / chữ Hán đã kiểm duyệt; ai-service
 * trích thành entries (bố cục danh sách) và entries của nguồn ACTIVE là "references" ghi đè từ điển khi cảnh báo mâu thuẫn (lúc phân
 * tích ở ExtractionWorker, lúc kiểm tra lại ở {@link ConflictService}). Mọi thao tác ghi sinh đúng một dòng audit trong cùng
 * transaction (target KNOWLEDGE_SOURCE).
 * <p>
 * Tải lên / cập nhật KHÔNG giữ kết nối DB trong lúc chờ ai-service (OCR + phân tích có thể mất cả phút): trích xong mới mở
 * transaction ngắn để lưu + audit.
 */
@Service
public class KnowledgeSourceService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeSourceService.class);

    /** Hợp đồng §5: tài liệu nguồn ≤ 2 MB / 20 trang (nguồn chuẩn là danh sách gọn, không phải giáo trình). */
    static final long MAX_BYTES = 2L * 1024 * 1024;
    static final int MAX_PAGES = 20;
    /**
     * Van an toàn cho số mục tham chiếu gửi mỗi lượt PHÂN TÍCH (ai-service không đặt trần, tra cứu O(1) mỗi thẻ). Mỗi nguồn bố cục
     * danh sách giữ tối đa ~700 mục nên mốc này ứng với ~70 nguồn ACTIVE — dùng thật không chạm tới; trần cũ 2000 cắt mất mục của
     * nguồn thứ 4 trở đi mà quản trị không hề biết. Chạm mốc thì ghi log cảnh báo. Kiểm tra lại không dùng trần này: đã biết term
     * của job nên lọc thẳng trong DB ({@link #referencesFor}).
     */
    static final int MAX_REFERENCES = 50_000;
    /**
     * Ký tự bỏ khi so khoá term giữa mục quản trị và item (lọc tham chiếu lúc kiểm tra lại): ～ / 〜 như _ref_key của ai-service, cộng
     * mọi khoảng trắng (cả khoảng trắng giữa). Bỏ nhiều hơn ai-service là cố ý: tập lọc ra là tập CHA của các mục ai-service sẽ khớp
     * (mục thừa vô hại, ai-service tự so lại đúng khoá), không bao giờ thiếu. Trùng chuỗi translate() trong
     * KnowledgeSourceRepository#referencesFor.
     */
    static final String KEY_STRIP_CHARS = " 　～〜";
    /** OTHER là tài liệu tham khảo tự do (không phải danh mục từng mục) nên không làm tham chiếu. */
    static final List<String> REFERENCE_KINDS =
            List.of(KnowledgeSource.KIND_VOCAB, KnowledgeSource.KIND_GRAMMAR, KnowledgeSource.KIND_KANJI);
    private static final Set<String> KINDS = Set.of(KnowledgeSource.KIND_VOCAB, KnowledgeSource.KIND_GRAMMAR,
            KnowledgeSource.KIND_KANJI, KnowledgeSource.KIND_OTHER);
    /**
     * Bố cục danh sách (mỗi dòng một cụm + cách đọc / nghĩa in sẵn), không tách chương, không tự cảnh báo mâu thuẫn (nguồn chuẩn chính
     * là tham chiếu), không lọc theo cấp người học — mọi dòng của danh sách đều là mục chuẩn.
     */
    static final Map<String, Object> ANALYZE_OPTIONS = Map.of(
            "extractMode", "list", "splitChapters", false, "warnConflicts", false,
            "levelFilter", "all", "treatUnknownAs", "above", "minFrequency", 1);
    private static final int MAX_TITLE = 200;
    private static final String AUDIT_TARGET = "KNOWLEDGE_SOURCE";
    private static final String NOT_FOUND = "Không tìm thấy nguồn tri thức.";

    private final KnowledgeSourceRepository repo;
    private final AiServiceClient ai;
    private final AuditService audit;
    private final TransactionTemplate tx;

    public KnowledgeSourceService(KnowledgeSourceRepository repo, AiServiceClient ai, AuditService audit,
                                  PlatformTransactionManager txManager) {
        this.repo = repo;
        this.ai = ai;
        this.audit = audit;
        this.tx = new TransactionTemplate(txManager);
    }

    /** Nội dung đã trích từ file / văn bản dán: văn bản, entries, meta. */
    record Extracted(String sourceName, String content, List<Map<String, Object>> entries, Map<String, Object> textMeta) {}

    // ---------- tham chiếu cho cảnh báo mâu thuẫn ----------

    /**
     * Mục của mọi nguồn ACTIVE loại VOCAB / GRAMMAR / KANJI (nguồn mới sửa trước) cho một lượt PHÂN TÍCH (chưa biết term nào sẽ ra):
     * [{term, reading?, meaning?, level?, sourceId}] đúng dạng ReferenceEntry của ai-service; sourceId là id nguồn nên cảnh báo trả về
     * source = "admin:&lt;id&gt;" chỉ được tới đúng nguồn. Chỉ cắt ở van an toàn {@value #MAX_REFERENCES} (kèm log cảnh báo).
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> activeReferences() {
        List<KnowledgeSourceRepository.ReferenceRow> rows = repo.activeReferences(REFERENCE_KINDS, MAX_REFERENCES + 1);
        if (rows.size() > MAX_REFERENCES) {
            log.warn("Nguồn tri thức chuẩn ACTIVE có hơn {} mục; lượt phân tích chỉ gửi {} mục của các nguồn mới sửa nhất",
                    MAX_REFERENCES, MAX_REFERENCES);
            rows = rows.subList(0, MAX_REFERENCES);
        }
        return toReferences(rows);
    }

    /**
     * Mục tham chiếu cho lượt KIỂM TRA LẠI: chỉ mục có khoá term trùng một trong {@code terms} (term của các item gửi đi), không trần
     * — job đã biết term nên lọc thẳng trong DB, mọi nguồn ACTIVE đều được dùng dù tổng số mục lớn tới đâu. Rỗng khi không có term.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> referencesFor(Collection<String> terms) {
        List<String> keys = terms.stream().map(KnowledgeSourceService::refKey).filter(k -> !k.isEmpty()).distinct().toList();
        if (keys.isEmpty()) return List.of();
        return toReferences(repo.referencesFor(REFERENCE_KINDS, keys));
    }

    /** Khoá so term (xem {@link #KEY_STRIP_CHARS}); null -> "". */
    static String refKey(String term) {
        if (term == null) return "";
        StringBuilder sb = new StringBuilder(term.length());
        term.codePoints().filter(cp -> KEY_STRIP_CHARS.indexOf(cp) < 0).forEach(sb::appendCodePoint);
        return sb.toString();
    }

    private static List<Map<String, Object>> toReferences(List<KnowledgeSourceRepository.ReferenceRow> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (KnowledgeSourceRepository.ReferenceRow r : rows) {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("term", r.getTerm());
            putIfText(e, "reading", r.getReading());
            putIfText(e, "meaning", r.getMeaning());
            putIfText(e, "level", r.getLevel());
            e.put("sourceId", r.getSourceId());
            out.add(e);
        }
        return out;
    }

    // ---------- đọc ----------

    @Transactional(readOnly = true)
    public AdminPage<Item> list(String kind, String status, String q, int page, int size) {
        Page<KnowledgeSourceRepository.Row> p = repo.search(kind == null ? "" : kind, status == null ? "" : status,
                AdminUserService.likePattern(q), PageRequest.of(page, size));
        return AdminPage.of(p, p.getContent().stream().map(Item::of).toList());
    }

    @Transactional(readOnly = true)
    public Detail detail(UUID id) {
        return detailOf(find(id));
    }

    // ---------- ghi ----------

    /** data/filename cho file; text cho văn bản dán (đúng một trong hai). 201 chi tiết; audit KNOWLEDGE_UPLOAD. */
    public Detail upload(User actor, byte[] data, String filename, String text, String title, String kind, String level) {
        String cleanTitle = requireTitle(title);
        String cleanKind = requireKind(kind);
        String cleanLevel = optionalLevel(level);
        Extracted ex = extract(data, filename, text, cleanKind, cleanLevel);
        UUID id = UUID.randomUUID();
        tx.executeWithoutResult(s -> {
            Instant now = Instant.now();
            KnowledgeSource k = new KnowledgeSource();
            k.setId(id);
            k.setTitle(cleanTitle);
            k.setKind(cleanKind);
            k.setLevel(cleanLevel);
            k.setVersion(1);
            apply(k, ex);
            k.setStatus(KnowledgeSource.ACTIVE);
            k.setUploadedBy(actor.getId());
            k.setCreatedAt(now);
            k.setUpdatedAt(now);
            repo.save(k);
            Map<String, Object> detail = new HashMap<>();
            detail.put("title", cleanTitle);
            detail.put("kind", cleanKind);
            detail.put("level", cleanLevel);
            detail.put("version", 1);
            detail.put("sourceName", ex.sourceName());
            detail.put("entryCount", ex.entries().size());
            audit.log(actor.getId(), "KNOWLEDGE_UPLOAD", AUDIT_TARGET, id.toString(), detail);
        });
        return detail(id);
    }

    /**
     * Thay nội dung = phiên bản mới (version + 1) trên cùng id; trạng thái giữ nguyên. Kiểm id trước khi gọi ai-service (404 sớm,
     * không tốn OCR), khoá dòng lúc ghi để hai admin cùng sửa không cùng ra một số version. Audit KNOWLEDGE_UPDATE kèm diff.
     */
    public Detail update(User actor, UUID id, byte[] data, String filename, String text, String title, String kind,
                         String level) {
        String cleanTitle = requireTitle(title);
        String cleanKind = requireKind(kind);
        String cleanLevel = optionalLevel(level);
        if (!repo.existsById(id)) throw notFound();
        Extracted ex = extract(data, filename, text, cleanKind, cleanLevel);
        tx.executeWithoutResult(s -> {
            KnowledgeSource k = repo.lockById(id).orElseThrow(KnowledgeSourceService::notFound);
            Map<String, Object> changes = new HashMap<>();
            changes.putAll(AuditService.diff("version", k.getVersion(), k.getVersion() + 1));
            if (!cleanTitle.equals(k.getTitle())) changes.putAll(AuditService.diff("title", k.getTitle(), cleanTitle));
            if (!cleanKind.equals(k.getKind())) changes.putAll(AuditService.diff("kind", k.getKind(), cleanKind));
            if (!Objects.equals(cleanLevel, k.getLevel())) changes.putAll(AuditService.diff("level", k.getLevel(), cleanLevel));
            if (!Objects.equals(ex.sourceName(), k.getSourceName())) {
                changes.putAll(AuditService.diff("sourceName", k.getSourceName(), ex.sourceName()));
            }
            changes.putAll(AuditService.diff("entryCount", k.getEntries() == null ? 0 : k.getEntries().size(),
                    ex.entries().size()));
            k.setTitle(cleanTitle);
            k.setKind(cleanKind);
            k.setLevel(cleanLevel);
            k.setVersion(k.getVersion() + 1);
            apply(k, ex);
            k.setUpdatedAt(Instant.now());
            audit.log(actor.getId(), "KNOWLEDGE_UPDATE", AUDIT_TARGET, id.toString(), changes);
        });
        return detail(id);
    }

    /** Ngừng dùng làm tham chiếu (giữ dữ liệu); đã ARCHIVED -> 409. Audit KNOWLEDGE_ARCHIVE. */
    public Item archive(User actor, UUID id) {
        return setStatus(actor, id, KnowledgeSource.ARCHIVED, "KNOWLEDGE_ARCHIVE", "Nguồn tri thức đã được lưu trữ.");
    }

    /** Dùng lại làm tham chiếu; đang ACTIVE -> 409. Audit KNOWLEDGE_ACTIVATE. */
    public Item activate(User actor, UUID id) {
        return setStatus(actor, id, KnowledgeSource.ACTIVE, "KNOWLEDGE_ACTIVATE", "Nguồn tri thức đang được dùng.");
    }

    /** Xoá hẳn (SUPER_ADMIN, chặn ở controller). Audit KNOWLEDGE_DELETE giữ lại tiêu đề / loại / phiên bản để còn tra được. */
    @Transactional
    public void delete(User actor, UUID id) {
        KnowledgeSource k = repo.lockById(id).orElseThrow(KnowledgeSourceService::notFound);
        Map<String, Object> detail = new HashMap<>();
        detail.put("title", k.getTitle());
        detail.put("kind", k.getKind());
        detail.put("level", k.getLevel());
        detail.put("version", k.getVersion());
        detail.put("status", k.getStatus());
        detail.put("entryCount", k.getEntries() == null ? 0 : k.getEntries().size());
        repo.delete(k);
        audit.log(actor.getId(), "KNOWLEDGE_DELETE", AUDIT_TARGET, id.toString(), detail);
    }

    // ---------- nội bộ ----------

    private Item setStatus(User actor, UUID id, String target, String action, String sameMessage) {
        tx.executeWithoutResult(s -> {
            KnowledgeSource k = repo.lockById(id).orElseThrow(KnowledgeSourceService::notFound);
            if (target.equals(k.getStatus())) throw new ResponseStatusException(HttpStatus.CONFLICT, sameMessage);
            Map<String, Object> detail = new HashMap<>(AuditService.diff("status", k.getStatus(), target));
            detail.put("title", k.getTitle());
            detail.put("version", k.getVersion());
            k.setStatus(target);
            k.setUpdatedAt(Instant.now());
            audit.log(actor.getId(), action, AUDIT_TARGET, id.toString(), detail);
        });
        return tx.execute(s -> Item.of(repo.row(id).orElseThrow(KnowledgeSourceService::notFound)));
    }

    /**
     * Kiểm đầu vào rồi trích: /extract/text (OCR khi cần) -> /extract/analyze bố cục danh sách -> entries. Lỗi tài liệu của ai-service
     * (định dạng, quá lớn, OCR chưa sẵn sàng) trả nguyên văn; ai-service không chạy -> 503.
     */
    Extracted extract(byte[] data, String filename, String text, String kind, String level) {
        boolean hasFile = data != null && data.length > 0;
        boolean hasText = text != null && !text.isBlank();
        if (hasFile == hasText) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gửi một file hoặc một đoạn văn bản.");
        }
        long bytes = hasFile ? data.length : text.getBytes(StandardCharsets.UTF_8).length;
        if (bytes > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Tài liệu nguồn vượt quá 2 MB.");
        }
        if (hasFile) ExtractionService.sniff(data, filename); // cùng danh sách định dạng + kiểm magic bytes như bóc tách

        TextResult tr = call(() -> ai.extractText(hasFile ? data : null, filename, hasText ? text : null, "auto", null));
        if (tr.text() == null || tr.text().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không trích được chữ tiếng Nhật nào từ tài liệu.");
        }
        Object pages = tr.meta() != null ? tr.meta().get("pages") : null;
        if (pages instanceof Number n && n.intValue() > MAX_PAGES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tài liệu nguồn vượt quá " + MAX_PAGES + " trang.");
        }
        AnalyzeResult ar = call(() -> ai.analyze(tr.text(), tr.blocks(), ANALYZE_OPTIONS));
        List<Map<String, Object>> entries = entriesOf(ar.items(), level);
        if (entries.isEmpty() && !KnowledgeSource.KIND_OTHER.equals(kind)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Không trích được mục nào. Nguồn chuẩn cần bố cục danh sách: mỗi dòng một từ / mẫu kèm cách đọc hoặc nghĩa.");
        }
        Map<String, Object> meta = new LinkedHashMap<>(tr.meta() != null ? tr.meta() : Map.of());
        if (Boolean.TRUE.equals(ar.truncated())) meta.put("truncated", true);
        return new Extracted(hasFile ? ExtractionWorker.cut(filename, 255) : null, tr.text(), entries, meta);
    }

    /**
     * Item ai-service -> {term, reading?, meaning?, level?}: mỗi term một mục (giữ lần đầu); bỏ mục ai-service nghi đọc sai (suspect:
     * OCR kém, cụm dính dòng) vì mục quản trị thắng từ điển với độ tin cậy 0.95 — một mục rác sẽ thành cảnh báo sai cho mọi người học.
     * <p>
     * Chỉ lưu cái TÀI LIỆU NGUỒN tự ghi, không bao giờ lưu giá trị đoán: mục quản trị có cách đọc thì một mình quyết định luật cách
     * đọc ở 0.95, nên cách đọc Sudachi đoán (明日 -> あした cho danh sách chỉ có cột nghĩa) sẽ báo sai 「あす」 cho mọi tài liệu ghi
     * 明日（あす）; gloss JMdict điền vào cũng biến luật nghĩa từ điển 0.5 thành cảnh báo quản trị 0.95. Vậy:
     * <ul>
     *   <li>reading = docReading (cột kana / ruby / kana ghi liền sau cụm), KHÔNG lùi về {@code reading} của item;</li>
     *   <li>meaning = meaningVi (bố cục danh sách chỉ điền từ nghĩa VI in sẵn trên dòng; đường này không gọi Gemini) hoặc
     *       docMeaningEn (nghĩa EN in sẵn), KHÔNG lùi về {@code meaningEn} (có thể là gloss từ điển);</li>
     *   <li>level = cấp quản trị khai cho cả nguồn (KHÔNG lấy cấp ai-service đoán: đó là ý kiến của danh sách JLPT, đem làm "mục
     *       quản trị" sẽ báo lệch 1 cấp với độ tin cậy 0.95).</li>
     * </ul>
     * Item /extract/analyze luôn mang docReading / docMeaningEn / docLevel (null = tài liệu không ghi), nên mục VOCAB lấy cách đọc từ
     * docReading; tài liệu không ghi cách đọc (hoặc ai-service cũ chưa trả khoá) thì mục chỉ có nghĩa / cấp — thiếu cách đọc là im lặng
     * (từ điển quyết), không bao giờ là cảnh báo sai.
     */
    static List<Map<String, Object>> entriesOf(List<AiDtos.Item> items, String level) {
        Map<String, Map<String, Object>> byTerm = new LinkedHashMap<>();
        for (AiDtos.Item it : items != null ? items : List.<AiDtos.Item>of()) {
            String term = ExtractionWorker.cut(it.term(), 200);
            if (term == null || Boolean.TRUE.equals(it.suspect()) || byTerm.containsKey(term)) continue;
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("term", term);
            putIfText(e, "reading", ExtractionWorker.cut(it.docReading(), 200));
            String meaning = ExtractionWorker.cut(it.meaningVi(), 1000);
            putIfText(e, "meaning", meaning != null ? meaning : ExtractionWorker.cut(it.docMeaningEn(), 1000));
            putIfText(e, "level", level);
            byTerm.put(term, e);
        }
        return new ArrayList<>(byTerm.values());
    }

    private static void apply(KnowledgeSource k, Extracted ex) {
        k.setSourceName(ex.sourceName());
        k.setContent(ex.content());
        k.setEntries(ex.entries());
        k.setTextMeta(ex.textMeta());
    }

    private Detail detailOf(KnowledgeSource k) {
        String email = k.getUploadedBy() == null ? null : audit.emailsOf(List.of(k.getUploadedBy())).get(k.getUploadedBy());
        List<Map<String, Object>> all = k.getEntries() != null ? k.getEntries() : List.of();
        List<Entry> entries = all.stream().limit(KnowledgeDtos.PREVIEW_ENTRIES)
                .map(e -> new Entry(str(e.get("term")), str(e.get("reading")), str(e.get("meaning")), str(e.get("level"))))
                .toList();
        String content = k.getContent();
        String preview = content == null ? null
                : content.length() <= KnowledgeDtos.PREVIEW_CHARS ? content : content.substring(0, KnowledgeDtos.PREVIEW_CHARS);
        return new Detail(k.getId(), k.getTitle(), k.getKind(), k.getLevel(), k.getVersion(), k.getSourceName(),
                k.getStatus(), all.size(), email, k.getCreatedAt(), k.getUpdatedAt(), preview, entries);
    }

    private KnowledgeSource find(UUID id) {
        return repo.findById(id).orElseThrow(KnowledgeSourceService::notFound);
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND);
    }

    private static String requireTitle(String title) {
        String t = title == null ? "" : title.strip();
        if (t.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tên nguồn không được để trống.");
        if (t.length() > MAX_TITLE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tên nguồn tối đa " + MAX_TITLE + " ký tự.");
        }
        return t;
    }

    private static String requireKind(String kind) {
        String k = kind == null ? "" : kind.strip();
        if (!KINDS.contains(k)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Loại nguồn phải là VOCAB, GRAMMAR, KANJI hoặc OTHER.");
        }
        return k;
    }

    /** Rỗng = không khai cấp. */
    private static String optionalLevel(String level) {
        if (level == null || level.isBlank()) return null;
        String l = level.strip();
        if (!l.matches("N[1-5]")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cấp JLPT phải từ N5 đến N1.");
        return l;
    }

    /**
     * Lỗi ai-service -> mã HTTP như tra cứu NLP (NlpService.upstream), thêm 413 cho tài liệu quá lớn: lỗi tài liệu (400 / 413 có
     * detail) hiện nguyên văn cho quản trị sửa; 422 là lỗi tham số của backend; còn lại (không kết nối, 5xx, sai key) -> 503.
     */
    static <T> T call(Supplier<T> request) {
        try {
            return request.get();
        } catch (AiServiceClient.AiServiceException e) {
            int status = e.status();
            if (status == 413) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, e.getMessage());
            if (status == 400) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
            if (status == 422) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tham số gửi dịch vụ AI không hợp lệ.");
            }
            if (status == 401 || status == 403) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "Dịch vụ AI tạm thời không khả dụng, vui lòng thử lại sau.");
            }
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, e.getMessage());
        }
    }

    private static void putIfText(Map<String, Object> m, String key, String value) {
        if (value != null && !value.isBlank()) m.put(key, value.strip());
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
