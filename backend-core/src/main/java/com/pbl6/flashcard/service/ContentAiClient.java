package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Lời gọi ai-service của nhóm tính năng nội dung (hợp đồng đợt 2 §4, §5, §9): mẹo nhớ bộ thủ, kiểm tra lại mâu thuẫn, câu ví dụ
 * i+1. Client mỏng trên các hàm dùng chung của {@link AiServiceClient} để các làn đợt 2 không cùng sửa một tệp; trả nguyên JSON
 * của ai-service, lỗi là {@link AiServiceClient.AiServiceException} (service gọi tự đổi thành mã HTTP).
 * <p>
 * Cả ba đều dùng timeout dài (như bóc tách): sinh mẹo gọi Gemini có thử lại / model dự phòng (hàng chục giây), kiểm mâu thuẫn
 * chạy tới 1000 mục, khai thác câu i+1 tách câu + Sudachi trên cả tài liệu — timeout 30 s của tra cứu NLP sẽ cắt ngang việc thật.
 */
@Service
public class ContentAiClient {

    private final AiServiceClient ai;

    public ContentAiClient(AiServiceClient ai) {
        this.ai = ai;
    }

    /**
     * POST /api/radicals/cards {kanji, withMnemonic: true}: {items: [{kanji, hanViet, meaningEn, strokeCount, radical: {no, char,
     * nameVi, meaningVi, hanViet} | null, mnemonicVi, mnemonicSource: "gemini" | "template", examples}], groups, reason}. ai-service
     * luôn điền mẹo (Gemini lỗi / hết quota thì dùng mẫu, ghi lý do vào reason) và tự bỏ mục không phải một chữ Hán. Gửi kèm
     * geminiModel = model Admin chọn ({@link AiServiceClient#geminiModel()}); "model" trả về là model đã viết các mẹo "gemini".
     */
    public JsonNode radicalCardsWithMnemonic(List<String> kanji) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("kanji", kanji);
        body.put("withMnemonic", true);
        String model = ai.geminiModel();
        if (model != null) body.put("geminiModel", model);
        return ai.postJsonLong("sinh mẹo nhớ bộ thủ", "/api/radicals/cards", body);
    }

    /**
     * POST /api/extract/conflicts {items, references, minConfidence}: {items: [{ref, conflicts: [...]}], stats}. items mang
     * {ref, term, kind, reading, meaningEn, meaningVi, level, docReading?, docMeaningEn?, docLevel?, ...} như ConflictItem của
     * ai-service (bỏ hẳn khoá docReading / docMeaningEn khi job cũ chưa lưu khai báo của tài liệu); references là mục của nguồn
     * chuẩn ACTIVE {term, reading, meaning, level, sourceId}. ≤ 1000 mục mỗi lần (quá → 400 từ ai-service).
     */
    public JsonNode conflicts(List<Map<String, Object>> items, List<Map<String, Object>> references, double minConfidence) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        body.put("references", references != null ? references : List.of());
        body.put("minConfidence", minConfidence);
        return ai.postJsonLong("kiểm tra mâu thuẫn", "/api/extract/conflicts", body);
    }

    /**
     * POST /api/mining/i-plus-one {text, knownLemmas, userLevel?, assumeLevelKnown, limit}: {items: [{sentence, target,
     * unknownCount, knownCount, length, score}], stats: {sentences, kept}}. userLevel null = để ai-service dùng cấp mặc định;
     * maxUnknown không gửi (mặc định 1 = đúng i+1).
     */
    public JsonNode iPlusOne(String text, List<String> knownLemmas, String userLevel, boolean assumeLevelKnown, int limit) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("text", text);
        body.put("knownLemmas", knownLemmas != null ? knownLemmas : List.of());
        if (userLevel != null && !userLevel.isBlank()) body.put("userLevel", userLevel);
        body.put("assumeLevelKnown", assumeLevelKnown);
        body.put("limit", limit);
        return ai.postJsonLong("tìm câu ví dụ i+1", "/api/mining/i-plus-one", body);
    }
}
