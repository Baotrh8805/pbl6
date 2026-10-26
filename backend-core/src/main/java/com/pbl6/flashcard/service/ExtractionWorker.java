package com.pbl6.flashcard.service;

import com.pbl6.flashcard.config.AsyncConfig;
import com.pbl6.flashcard.dto.extraction.AiDtos;
import com.pbl6.flashcard.dto.extraction.AiDtos.AnalyzeResult;
import com.pbl6.flashcard.dto.extraction.AiDtos.EnrichRequest;
import com.pbl6.flashcard.dto.extraction.AiDtos.EnrichResult;
import com.pbl6.flashcard.dto.extraction.AiDtos.TextResult;
import com.pbl6.flashcard.model.ExtractionItem;
import com.pbl6.flashcard.model.ExtractionJob;
import com.pbl6.flashcard.repository.ExtractionItemRepository;
import com.pbl6.flashcard.repository.ExtractionJobRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * Chạy pipeline TEXT -> ANALYZE -> ENRICH cho một job trên thread nền. Mỗi giai đoạn một transaction ngắn để
 * client poll thấy tiến độ và kết nối DB không bị giữ trong lúc chờ ai-service. Byte của file chỉ sống trong
 * lúc gọi bước TEXT, không lưu đâu cả.
 */
@Component
public class ExtractionWorker {

    private static final Logger log = LoggerFactory.getLogger(ExtractionWorker.class);

    private final ExtractionJobRepository jobs;
    private final ExtractionItemRepository items;
    private final AiServiceClient ai;
    private final TransactionTemplate tx;
    private final ApplicationEventPublisher events;
    // F2: mục tham chiếu của nguồn tri thức chuẩn ACTIVE + ngưỡng cảnh báo gửi kèm mỗi lượt phân tích (analyzeOptions)
    private final KnowledgeSourceService knowledge;
    private final SettingsService settings;

    /** Nghĩa tiếng Việt đã có trong từ điển (spec 2026-10-26 §9.3): dùng trước khi gọi Gemini, ghi lại sau khi dịch. */
    private final com.pbl6.flashcard.service.dictionary.DictionaryStore dictionary;

    public ExtractionWorker(ExtractionJobRepository jobs, ExtractionItemRepository items, AiServiceClient ai,
                            PlatformTransactionManager txManager, ApplicationEventPublisher events,
                            KnowledgeSourceService knowledge, SettingsService settings,
                            com.pbl6.flashcard.service.dictionary.DictionaryStore dictionary) {
        this.dictionary = dictionary;
        this.events = events;
        this.knowledge = knowledge;
        this.settings = settings;
        this.jobs = jobs;
        this.items = items;
        this.ai = ai;
        this.tx = new TransactionTemplate(txManager);
    }

    /**
     * Job mới: từ bước TEXT. data != null = file; text != null = văn bản dán. ocrFallbackConfidence = cấu hình
     * ocr_fallback_confidence lúc gửi (null = để ai-service dùng mặc định của nó).
     */
    @Async(AsyncConfig.EXTRACTION_EXECUTOR)
    public void runFromText(UUID jobId, byte[] data, String filename, String text, String ocrMode,
                            Double ocrFallbackConfidence) {
        try {
            update(jobId, j -> {
                j.setStatus(ExtractionJob.RUNNING);
                j.setStage(ExtractionJob.STAGE_TEXT);
                j.setStartedAt(Instant.now());
                j.setErrorMessage(null);
                j.setFailureKind(null);
            });
            TextResult tr = ai.extractText(data, filename, text, ocrMode, ocrFallbackConfidence);
            if (tr.text() == null || tr.text().isBlank()) {
                throw new AiServiceClient.AiServiceException("Không trích được chữ tiếng Nhật nào từ tài liệu.");
            }
            Map<String, Object> meta = new LinkedHashMap<>(tr.meta() != null ? tr.meta() : Map.of());
            if (tr.blocks() != null) meta.put("blocks", tr.blocks());
            // Ghi ngưỡng đã dùng để soát lỗi OCR sau này; ai-service mới tự trả lại ngưỡng nó thật sự dùng (ưu tiên giá trị đó),
            // bản cũ không trả thì ghi giá trị đã gửi
            if (ocrFallbackConfidence != null) meta.putIfAbsent("ocrFallbackConfidence", ocrFallbackConfidence);
            update(jobId, j -> {
                j.setExtractedText(tr.text());
                j.setTextMeta(meta);
            });
            analyzeAndFinish(jobId);
        } catch (RuntimeException e) {
            fail(jobId, e);
        }
    }

    /** Phân tích lại từ văn bản đã lưu (người dùng sửa OCR / chạy lại sau lỗi). */
    @Async(AsyncConfig.EXTRACTION_EXECUTOR)
    public void runFromAnalyze(UUID jobId) {
        try {
            update(jobId, j -> {
                j.setStatus(ExtractionJob.RUNNING);
                j.setStartedAt(Instant.now());
                j.setFinishedAt(null);
                j.setErrorMessage(null);
                j.setFailureKind(null);
            });
            analyzeAndFinish(jobId);
        } catch (RuntimeException e) {
            fail(jobId, e);
        }
    }

    private void analyzeAndFinish(UUID jobId) {
        update(jobId, j -> j.setStage(ExtractionJob.STAGE_ANALYZE));
        ExtractionJob snapshot = tx.execute(s -> jobs.findById(jobId).orElseThrow());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> blocks = snapshot.getTextMeta() != null
                ? (List<Map<String, Object>>) snapshot.getTextMeta().get("blocks") : null;
        Map<String, Object> sent = analyzeOptions(jobId, snapshot.getOptions());
        AnalyzeResult ar = ai.analyze(snapshot.getExtractedText(), blocks, sent);

        List<ExtractionItem> created = new ArrayList<>();
        Map<UUID, String> dictKeys = new HashMap<>();
        int position = 0;
        for (AiDtos.Item it : ar.items() != null ? ar.items() : List.<AiDtos.Item>of()) {
            if (it.term() == null || it.term().isBlank()) continue;
            ExtractionItem e = toEntity(jobId, it, ++position);
            created.add(e);
            if (it.dictKey() != null && it.dictKey().startsWith("w:")) dictKeys.put(e.getId(), it.dictKey());
        }
        Map<String, Object> stats = new LinkedHashMap<>(ar.stats() != null ? ar.stats() : Map.of());
        if (Boolean.TRUE.equals(ar.truncated())) stats.put("truncated", true);
        Object threshold = sent.get(ConflictSupport.OPTION_MIN_CONFIDENCE);
        tx.executeWithoutResult(s -> {
            items.deleteByJobId(jobId);
            items.saveAll(created);
            jobs.findById(jobId).ifPresent(j -> {
                j.setStats(stats);
                // Job tạo trước F2 vừa được phân tích lại: ghi ngưỡng đã dùng, đồng thời đánh dấu item mới là kết quả của pipeline
                // có F2 (ConflictService.analysedWithF2) — kiểm tra lại sau đó không được coi cách đọc Sudachi là của tài liệu
                if (j.getOptions() == null || j.getOptions().get(ConflictSupport.OPTION_MIN_CONFIDENCE) == null) {
                    Map<String, Object> options = new LinkedHashMap<>(j.getOptions() != null ? j.getOptions() : Map.of());
                    options.put(ConflictSupport.OPTION_MIN_CONFIDENCE, threshold);
                    j.setOptions(options);
                }
            });
        });

        boolean wantVi = "vi".equals(snapshot.getOptions().get("meaningLang"));
        if (wantVi && !created.isEmpty()) {
            update(jobId, j -> j.setStage(ExtractionJob.STAGE_ENRICH));
            enrich(jobId, created, stats, dictKeys);
        } else {
            stats.put("enriched", false);
        }

        update(jobId, j -> {
            j.setStats(stats);
            j.setStatus(ExtractionJob.DONE);
            j.setStage(ExtractionJob.DONE);
            j.setFinishedAt(Instant.now());
        });
        publishFinished(jobId, ExtractionJob.DONE);
    }

    /**
     * Tuỳ chọn gửi /extract/analyze = options đã lưu của job + references (F2): mục của nguồn tri thức chuẩn ACTIVE, đọc lúc chạy
     * nên "Chạy lại" dùng nguồn mới nhất. references KHÔNG lưu vào extraction_jobs.options: có thể hàng nghìn mục mỗi job, và
     * options được trả nguyên cho client mỗi lần poll. conflictMinConfidence nằm trong options từ lúc tạo job
     * (ExtractionService.prepareJob); job tạo trước F2 không có thì lấy cấu hình hiện tại — thiếu nó ai-service dùng mặc định 0.6 của
     * nó thay vì contradiction_alert_threshold, và chỉ job đó hiện các cảnh báo 0.6 mà ngưỡng quản trị đã ẩn. Đọc nguồn chuẩn lỗi
     * không được làm hỏng lượt bóc tách: phân tích tiếp, chỉ so với từ điển.
     */
    private Map<String, Object> analyzeOptions(UUID jobId, Map<String, Object> stored) {
        Map<String, Object> options = new LinkedHashMap<>(stored != null ? stored : Map.of());
        if (options.get(ConflictSupport.OPTION_MIN_CONFIDENCE) == null) {
            options.put(ConflictSupport.OPTION_MIN_CONFIDENCE, ConflictSupport.minConfidence(settings));
        }
        try {
            options.put("references", knowledge.activeReferences());
        } catch (RuntimeException e) {
            log.warn("Không đọc được nguồn tri thức chuẩn cho job {}, phân tích không kèm tham chiếu", jobId, e);
        }
        return options;
    }

    /** Listener lỗi không được làm đổi trạng thái job. */
    private void publishFinished(UUID jobId, String status) {
        try {
            events.publishEvent(new ExtractionJobFinishedEvent(jobId, status));
        } catch (RuntimeException e) {
            log.error("Listener sự kiện kết thúc job {} bị lỗi", jobId, e);
        }
    }

    /** Nghĩa tiếng Việt chỉ là phần làm giàu: lỗi ở đây không làm job thất bại (giữ nghĩa tiếng Anh). */
    /** Chỉ chạy lại bước ENRICH (người dùng bấm "Dịch lại nghĩa" sau khi Gemini hết quota): không phân tích lại,
     *  không chạm item đã có nghĩa VI (từ tài liệu hoặc người dùng sửa). */
    @Async(AsyncConfig.EXTRACTION_EXECUTOR)
    public void runEnrich(UUID jobId) {
        try {
            update(jobId, j -> {
                j.setStatus(ExtractionJob.RUNNING);
                j.setStage(ExtractionJob.STAGE_ENRICH);
                j.setStartedAt(Instant.now());
                j.setFinishedAt(null);
                j.setErrorMessage(null);
                j.setFailureKind(null);
            });
            ExtractionJob snapshot = tx.execute(s -> jobs.findById(jobId).orElseThrow());
            Map<String, Object> stats = new LinkedHashMap<>(snapshot.getStats() != null ? snapshot.getStats() : Map.of());
            List<ExtractionItem> pending = tx.execute(s -> items.findByJobIdOrderByPositionAsc(jobId));
            enrich(jobId, pending, stats, Map.of());
            stats.put("enrichedAt", Instant.now().toString());
            update(jobId, j -> {
                j.setStats(stats);
                j.setStatus(ExtractionJob.DONE);
                j.setStage(ExtractionJob.DONE);
                j.setFinishedAt(Instant.now());
            });
        } catch (RuntimeException e) {
            fail(jobId, e);
        }
    }

    private void enrich(UUID jobId, List<ExtractionItem> created, Map<String, Object> stats, Map<UUID, String> dictKeys) {
        stats.put("fromDictionary", fillFromDictionary(created, dictKeys));
        List<AiDtos.EnrichInput> inputs = new ArrayList<>();
        Map<String, ExtractionItem> byRef = new HashMap<>();
        for (ExtractionItem i : created) {
            if (!ExtractionItem.VOCAB.equals(i.getKind()) || i.getMeaningVi() != null) continue;
            String ref = i.getId().toString();
            byRef.put(ref, i);
            inputs.add(new AiDtos.EnrichInput(ref, i.getTerm(), i.getReading(), i.getPos(), i.getMeaningEn(), i.getExample()));
        }
        if (inputs.isEmpty()) {
            // không còn gì để dịch (mọi nghĩa VI đã có từ tài liệu / lần dịch trước) -> không giữ lý do lỗi cũ
            stats.put("enriched", false);
            stats.remove("enrichReason");
            return;
        }
        try {
            EnrichResult er = ai.enrich(new EnrichRequest("vi", inputs));
            boolean enriched = Boolean.TRUE.equals(er.enriched());
            stats.put("enriched", enriched);
            stats.remove("enrichReason"); // "Dịch lại nghĩa" thành công thì cảnh báo hết quota cũ phải biến mất
            if (er.reason() != null) stats.put("enrichReason", er.reason());
            if (!enriched || er.items() == null) return;
            Map<UUID, AiDtos.EnrichOutput> outputs = new HashMap<>();
            for (AiDtos.EnrichOutput o : er.items()) {
                ExtractionItem target = o.ref() != null ? byRef.get(o.ref()) : null;
                if (target != null) outputs.put(target.getId(), o);
            }
            tx.executeWithoutResult(s -> {
                for (ExtractionItem i : items.findAllById(outputs.keySet())) {
                    AiDtos.EnrichOutput o = outputs.get(i.getId());
                    if (o.meaningVi() != null && !o.meaningVi().isBlank()) i.setMeaningVi(cut(o.meaningVi(), 1000));
                    if (o.exampleVi() != null && !o.exampleVi().isBlank()) i.setExampleVi(cut(o.exampleVi(), 500));
                }
            });
            // Nghĩa Gemini vừa dịch cho mục có dictKey -> lưu vào từ điển (không đè bản đã có), lần sau khỏi gọi lại
            saveToDictionary(outputs, byRef, dictKeys);
        } catch (AiServiceClient.AiServiceException e) {
            log.warn("Bỏ qua bước dịch nghĩa cho job {}: {}", jobId, e.getMessage());
            stats.put("enriched", false);
            stats.put("enrichReason", "error");
        } catch (RuntimeException e) {
            // Mọi lỗi khác (timeout đọc body, JSON lạ...) cũng không được làm job FAILED: thẻ vẫn có nghĩa EN
            log.error("Bỏ qua bước dịch nghĩa cho job {} vì lỗi bất ngờ", jobId, e);
            stats.put("enriched", false);
            stats.put("enrichReason", "error");
        }
    }

    /**
     * Gán nghĩa tiếng Việt có sẵn trong từ điển cho item vocab chưa có nghĩa (theo dictKey, không có thì theo (term, cách đọc)),
     * lưu DB luôn. Trả số item đã gán. Lỗi DB không làm hỏng bước dịch (Gemini vẫn dịch phần còn lại như cũ).
     */
    private int fillFromDictionary(List<ExtractionItem> list, Map<UUID, String> dictKeys) {
        try {
            List<ExtractionItem> need = list.stream()
                    .filter(i -> ExtractionItem.VOCAB.equals(i.getKind()) && i.getMeaningVi() == null).toList();
            if (need.isEmpty()) return 0;
            Map<String, com.pbl6.flashcard.service.dictionary.DictionaryStore.Meaning> byKey = dictionary.meanings(
                    need.stream().map(i -> dictKeys.get(i.getId())).filter(java.util.Objects::nonNull).distinct().toList());
            Map<String, com.pbl6.flashcard.service.dictionary.DictionaryStore.Meaning> byTerm = dictionary.meaningsByTerm(
                    need.stream().map(ExtractionItem::getTerm).distinct().toList());
            Map<UUID, String> found = new HashMap<>();
            for (ExtractionItem i : need) {
                com.pbl6.flashcard.service.dictionary.DictionaryStore.Meaning m = dictKeys.containsKey(i.getId()) ? byKey.get(dictKeys.get(i.getId())) : null;
                if (m == null) m = byTerm.get(com.pbl6.flashcard.service.dictionary.DictionaryStore.termKey(i.getTerm(), i.getReading()));
                if (m != null) found.put(i.getId(), m.meaningVi());
            }
            if (found.isEmpty()) return 0;
            tx.executeWithoutResult(s -> {
                for (ExtractionItem i : items.findAllById(found.keySet())) {
                    if (i.getMeaningVi() == null) i.setMeaningVi(cut(found.get(i.getId()), 1000));
                }
            });
            for (ExtractionItem i : need) {
                if (found.containsKey(i.getId())) i.setMeaningVi(cut(found.get(i.getId()), 1000));
            }
            return found.size();
        } catch (RuntimeException e) {
            log.warn("Bỏ qua tra nghĩa từ điển khi bóc tách: {}", e.getMessage());
            return 0;
        }
    }

    private void saveToDictionary(Map<UUID, AiDtos.EnrichOutput> outputs, Map<String, ExtractionItem> byRef,
                                  Map<UUID, String> dictKeys) {
        if (dictKeys.isEmpty()) return;
        try {
            for (ExtractionItem i : byRef.values()) {
                String key = dictKeys.get(i.getId());
                AiDtos.EnrichOutput o = outputs.get(i.getId());
                if (key == null || o == null || o.meaningVi() == null || o.meaningVi().isBlank()) continue;
                dictionary.insertMachineMeaning(key, i.getTerm(), i.getReading(), i.getLevel(), cut(o.meaningVi().strip(), 1000),
                        "GEMINI", ai.geminiModel());
            }
        } catch (RuntimeException e) {
            log.warn("Không lưu được nghĩa vừa dịch vào từ điển: {}", e.getMessage());
        }
    }

    private static ExtractionItem toEntity(UUID jobId, AiDtos.Item it, int position) {
        ExtractionItem e = new ExtractionItem();
        e.setId(UUID.randomUUID());
        e.setJobId(jobId);
        e.setKind(ExtractionItem.GRAMMAR.equals(it.kind()) ? ExtractionItem.GRAMMAR : ExtractionItem.VOCAB);
        e.setPosition(it.position() != null ? it.position() : position);
        e.setTerm(cut(it.term(), 200));
        e.setSurface(cut(it.surface(), 200));
        e.setReading(cut(it.reading(), 200));
        e.setReadingSegments(it.readingSegments());
        e.setHanViet(cut(it.hanViet(), 100));
        e.setPos(cut(it.pos(), 40));
        e.setMeaningEn(cut(it.meaningEn(), 1000));
        e.setMeaningVi(cut(it.meaningVi(), 1000));
        e.setLevel(it.level() != null && it.level().matches("N[1-5]") ? it.level() : null);
        e.setLevelConfidence(it.levelConfidence());
        e.setLevelSources(it.levelSources());
        e.setFrequency(it.frequency() != null && it.frequency() > 0 ? it.frequency() : 1);
        e.setExample(cut(it.example(), 500));
        e.setExampleVi(cut(it.exampleVi(), 500));
        // OCR đọc kém (chữ đơn trên dòng tin cậy thấp, không có trong từ điển) -> bỏ chọn sẵn để người dùng xem lại
        e.setChapterNo(it.chapter());
        e.setSelected(!Boolean.TRUE.equals(it.suspect()));
        // F2: cảnh báo mâu thuẫn ai-service gắn sẵn (chuẩn hoá note_vi -> noteVi); cách đọc / nghĩa tài liệu khai để kiểm tra lại sau
        e.setConflicts(ConflictSupport.normalize(it.conflicts()));
        e.setDocReading(cut(it.docReading(), 200));
        e.setDocMeaningEn(cut(it.docMeaningEn(), 1000));
        return e;
    }

    static String cut(String s, int max) {
        if (s == null) return null;
        String t = s.strip();
        if (t.isEmpty()) return null;
        return t.length() <= max ? t : t.substring(0, max);
    }

    private void update(UUID jobId, Consumer<ExtractionJob> change) {
        tx.executeWithoutResult(s -> jobs.findById(jobId).ifPresent(change));
    }

    private void fail(UUID jobId, RuntimeException e) {
        String message = e instanceof AiServiceClient.AiServiceException ? e.getMessage()
                : "Lỗi hệ thống khi xử lý tài liệu.";
        if (!(e instanceof AiServiceClient.AiServiceException)) log.error("Job bóc tách {} lỗi", jobId, e);
        else log.warn("Job bóc tách {} thất bại: {}", jobId, e.getMessage());
        // Spec 21/10: ai-service 503 aiOverloaded (Gemini quá tải, không có bản Tesseract) -> lỗi do hệ thống, không tính lượt
        boolean overloaded = e instanceof AiServiceClient.AiServiceException a && a.isOverloaded();
        try {
            update(jobId, j -> {
                j.setStatus(ExtractionJob.FAILED);
                j.setErrorMessage(cut(message, 500));
                j.setFailureKind(overloaded ? ExtractionJob.FAILURE_AI_OVERLOADED : null);
                j.setFinishedAt(Instant.now());
            });
        } catch (RuntimeException inner) {
            log.error("Không ghi được trạng thái FAILED cho job {}", jobId, inner);
            return;
        }
        publishFinished(jobId, ExtractionJob.FAILED);
    }
}
