package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Client mỏng của nhóm quiz đa loại (hợp đồng đợt 2 §1) sang ai-service, đi qua các hàm dùng chung của {@link AiServiceClient}
 * (không sửa tệp đó để các nhóm khác không đụng nhau). Lỗi ai-service giữ nguyên là {@link AiServiceClient.AiServiceException}:
 * nơi gọi tự quyết định đổi thành 503 (sinh phương án nhiễu theo yêu cầu) hay lặng lẽ lùi về câu "meaning" (bắt đầu lượt quiz).
 * Hằng số giới hạn khớp ai-service/app/api/extract_router.py và grammar_router.py: vượt giới hạn ai-service trả 400 / 422 cho
 * cả lô, nên ở đây chia lô và lọc trước thay vì để một thẻ dài làm hỏng mọi thẻ khác.
 */
@Service
public class QuizAiClient {

    /** MAX_DISTRACTOR_ITEMS của extract_router.py. */
    static final int MAX_DISTRACTOR_ITEMS = 1000;
    /** MAX_VERBS của grammar_router.py. */
    static final int MAX_CONJUGATION_VERBS = 200;
    /** QuizVerb.term / reading max_length của grammar_router.py. */
    static final int MAX_VERB_CHARS = 64;
    /** Số phương án nhiễu mỗi loại cho một thẻ: câu trắc nghiệm 4 lựa chọn = 1 đúng + 3 nhiễu. */
    static final int DISTRACTORS_PER_KIND = 3;
    /** Mặc định của distractor_min_confidence (V21) khi cấu hình hỏng: không để một ô cấu hình làm hỏng cả lượt sinh. */
    static final double DEFAULT_MIN_CONFIDENCE = 0.6;
    static final List<String> DISTRACTOR_KINDS = List.of("kanji_lookalike", "homophone");
    /** Khoá của ứng viên được giữ khi lưu vào flashcards.distractors (bỏ trường lạ ai-service có thể thêm sau). */
    private static final List<String> CANDIDATE_KEYS = List.of("term", "reading", "meaning", "level", "confidence");

    private final AiServiceClient ai;
    private final SettingsService settings;

    public QuizAiClient(AiServiceClient ai, SettingsService settings) {
        this.ai = ai;
        this.settings = settings;
    }

    // ---------- phương án gây nhiễu (C2 chữ giống hình, C3 từ đồng âm) ----------

    /** Một thẻ gửi đi: ref = id thẻ (ai-service trả lại nguyên để ghép), meaning = dòng nghĩa chính. */
    public record DistractorInput(String ref, String term, String reading, String meaning, String level) {}

    /**
     * Kết quả cho một thẻ. Ứng viên là map {term, reading, meaning, level, confidence} đúng dạng lưu ở flashcards.distractors,
     * đã bỏ ứng viên không có term.
     */
    public record Distractors(String ref, List<Map<String, Object>> kanjiLookalike, List<Map<String, Object>> homophones) {

        /** Giá trị ghi vào flashcards.distractors (khoá theo hợp đồng §1.1). */
        public Map<String, Object> toColumn() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("kanjiLookalike", kanjiLookalike);
            m.put("homophones", homophones);
            return m;
        }
    }

    /**
     * POST /api/extract/distractors {items, kinds, minConfidence, k}. Tác vụ dài (cả bộ thẻ, tra JMdict) nên dùng timeout của
     * bóc tách. minConfidence đọc từ app_settings.distractor_min_confidence (Admin > Cấu hình) mỗi lần gọi để đổi có hiệu lực
     * ngay. Thẻ thiếu term bị bỏ (ai-service bắt buộc min_length 1). Thẻ không có dữ liệu -> hai danh sách rỗng, không lỗi.
     */
    public List<Distractors> distractors(List<DistractorInput> items) {
        List<DistractorInput> valid = items == null ? List.of() : items.stream()
                .filter(i -> i != null && i.ref() != null && i.term() != null && !i.term().isBlank())
                .toList();
        if (valid.isEmpty()) return List.of();
        double minConfidence = Math.max(0.0, Math.min(1.0,
                settings.getDouble(SettingsService.KEY_DISTRACTOR_MIN, DEFAULT_MIN_CONFIDENCE)));
        List<Distractors> out = new ArrayList<>(valid.size());
        for (int from = 0; from < valid.size(); from += MAX_DISTRACTOR_ITEMS) {
            List<DistractorInput> chunk = valid.subList(from, Math.min(from + MAX_DISTRACTOR_ITEMS, valid.size()));
            List<Map<String, Object>> payload = new ArrayList<>(chunk.size());
            for (DistractorInput i : chunk) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("ref", i.ref());
                m.put("term", i.term().strip());
                if (i.reading() != null && !i.reading().isBlank()) m.put("reading", i.reading().strip());
                if (i.meaning() != null && !i.meaning().isBlank()) m.put("meaning", i.meaning().strip());
                if (i.level() != null) m.put("level", i.level());
                payload.add(m);
            }
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("items", payload);
            body.put("kinds", DISTRACTOR_KINDS);
            body.put("minConfidence", minConfidence);
            body.put("k", DISTRACTORS_PER_KIND);
            JsonNode res = ai.postJsonLong("sinh phương án gây nhiễu", "/api/extract/distractors", body);
            for (JsonNode row : res.path("items")) {
                String ref = text(row, "ref");
                if (ref == null) continue;
                out.add(new Distractors(ref, candidates(row.path("kanjiLookalike")), candidates(row.path("homophones"))));
            }
        }
        return out;
    }

    private static List<Map<String, Object>> candidates(JsonNode list) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (JsonNode c : list) {
            String term = text(c, "term");
            if (term == null || term.isBlank()) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            for (String key : CANDIDATE_KEYS) {
                JsonNode v = c.get(key);
                if (v == null || v.isNull()) m.put(key, null);
                else m.put(key, v.isNumber() ? (Object) v.asDouble() : v.asText());
            }
            out.add(m);
        }
        return out;
    }

    // ---------- quiz chia động từ (C7) ----------

    public record Verb(String term, String reading) {}

    /** Một câu: options đã xáo (4 phương án), correct nằm trong options; example = câu ví dụ chứa dạng đúng. */
    public record ConjugationItem(String term, String lemma, String reading, String group, String form, String formLabelVi,
                                  String prompt, String correct, List<String> options, String example) {}

    /** reason: empty | not_a_verb | duplicate | no_forms (ai-service) | too_long (lọc ở đây, quá giới hạn ai-service). */
    public record Skipped(String term, String reason) {}

    public record ConjugationQuiz(List<ConjugationItem> items, List<Skipped> skipped) {}

    /**
     * POST /api/grammar/conjugation-quiz {verbs, forms?, perVerb, seed}. Người học đang chờ bắt đầu lượt quiz nên dùng timeout
     * tương tác (30 s). forms null / rỗng = mọi dạng ai-service hỗ trợ. Cùng seed + cùng danh sách -> cùng câu hỏi (ai-service
     * dùng RNG riêng cho từng động từ). Thuật ngữ dài hơn giới hạn ai-service không phải động từ: bỏ qua ở đây với lý do
     * too_long; cách đọc quá dài thì không gửi (ai-service tự tra).
     */
    public ConjugationQuiz conjugationQuiz(List<Verb> verbs, List<String> forms, int perVerb, long seed) {
        List<ConjugationItem> items = new ArrayList<>();
        List<Skipped> skipped = new ArrayList<>();
        List<Map<String, Object>> payload = new ArrayList<>();
        for (Verb v : verbs == null ? List.<Verb>of() : verbs) {
            String term = v == null || v.term() == null ? "" : v.term().strip();
            if (term.isEmpty()) {
                skipped.add(new Skipped(term, "empty"));
            } else if (term.length() > MAX_VERB_CHARS) {
                skipped.add(new Skipped(term, "too_long"));
            } else {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("term", term);
                String reading = v.reading() == null ? null : v.reading().strip();
                if (reading != null && !reading.isEmpty() && reading.length() <= MAX_VERB_CHARS) m.put("reading", reading);
                payload.add(m);
            }
        }
        int per = Math.max(1, Math.min(5, perVerb)); // perVerb ge=1 le=5 của ai-service
        // ai-service chỉ bỏ trùng lemma trong một lô (chỉ xảy ra khi > 200 động từ): nhớ lemma của các lô trước để kết quả như
        // một lần gọi. Trong cùng lô, perVerb > 1 cho nhiều câu cùng lemma — đó không phải trùng.
        Set<String> earlier = new HashSet<>();
        for (int from = 0; from < payload.size(); from += MAX_CONJUGATION_VERBS) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("verbs", payload.subList(from, Math.min(from + MAX_CONJUGATION_VERBS, payload.size())));
            if (forms != null && !forms.isEmpty()) body.put("forms", forms);
            body.put("perVerb", per);
            body.put("seed", seed);
            JsonNode res = ai.postJson("tạo câu hỏi chia động từ", "/api/grammar/conjugation-quiz", body);
            Set<String> thisChunk = new HashSet<>();
            Set<String> reported = new HashSet<>();
            for (JsonNode it : res.path("items")) {
                String lemma = text(it, "lemma");
                String correct = text(it, "correct");
                if (correct == null) continue;
                if (lemma != null && earlier.contains(lemma)) {
                    if (reported.add(lemma)) skipped.add(new Skipped(text(it, "term"), "duplicate"));
                    continue;
                }
                if (lemma != null) thisChunk.add(lemma);
                List<String> options = new ArrayList<>();
                for (JsonNode o : it.path("options")) if (o.isTextual()) options.add(o.asText());
                items.add(new ConjugationItem(text(it, "term"), lemma, text(it, "reading"), text(it, "group"),
                        text(it, "form"), text(it, "formLabelVi"), text(it, "prompt"), correct, options,
                        text(it, "example")));
            }
            earlier.addAll(thisChunk);
            for (JsonNode s : res.path("skipped")) skipped.add(new Skipped(text(s, "term"), text(s, "reason")));
        }
        return new ConjugationQuiz(items, skipped);
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }
}
