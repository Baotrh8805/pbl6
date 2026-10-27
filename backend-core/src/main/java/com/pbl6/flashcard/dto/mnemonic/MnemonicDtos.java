package com.pbl6.flashcard.dto.mnemonic;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.pbl6.flashcard.model.KanjiMnemonic;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Body / response của mẹo nhớ chữ Hán (hợp đồng đợt 2 §4): /api/kanji/** cho người học, /api/admin/mnemonics cho admin. */
public final class MnemonicDtos {

    private MnemonicDtos() {}

    /** Trần một lần sinh mẹo (Gemini một lượt cho cả lô; giới hạn để một request không đốt quota cả ngày). */
    public static final int MAX_GENERATE = 30;
    public static final int MAX_USER_CHARS = 300;
    /** Admin sửa được tới độ dài cột (mẹo AI ≤ 300 nhưng admin có thể viết lại dài hơn chút). */
    public static final int MAX_ADMIN_CHARS = 500;
    public static final int MAX_NOTE_CHARS = 500;

    // ---------- người học ----------

    /** Mỗi phần tử là một chữ; ≤ 4 đơn vị UTF-16 như NlpRequests (đủ cho chữ ngoài BMP), kiểm "một chữ Hán" ở service. */
    public record GenerateRequest(@NotEmpty @Size(max = MAX_GENERATE) List<@NotNull @Size(min = 1, max = 4) String> kanji) {}

    public record CreateRequest(@NotBlank @Size(max = 4) String kanji,
                                @NotBlank @Size(max = MAX_USER_CHARS) String mnemonicVi) {}

    /** approved luôn có mặt (null khi chữ chưa có mẹo công khai) để frontend không phải phân biệt "thiếu" với "chưa có". */
    public record KanjiMnemonicsResponse(String kanji, Approved approved, List<Mine> mine) {}

    public record Approved(UUID id, String mnemonicVi, String source) {
        public static Approved of(KanjiMnemonic m) {
            return new Approved(m.getId(), m.getMnemonicVi(), m.getSource());
        }
    }

    /** Một mẹo của chính mình (cũng là response 201 của POST /api/kanji/mnemonics). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Mine(UUID id, String kanji, String mnemonicVi, String source, String status, String reviewNote,
                       Instant createdAt, /* V38: nhãn AI 0 sạch / 1 xúc phạm / 2 thù ghét (null khi chưa chấm) */ Integer modLabel) {
        public static Mine of(KanjiMnemonic m) {
            return new Mine(m.getId(), m.getKanji(), m.getMnemonicVi(), m.getSource(), m.getStatus(), m.getReviewNote(),
                    m.getCreatedAt(), m.getModLabel());
        }
    }

    public record Generated(UUID id, String kanji, String mnemonicVi, String source, String status) {
        public static Generated of(KanjiMnemonic m) {
            return new Generated(m.getId(), m.getKanji(), m.getMnemonicVi(), m.getSource(), m.getStatus());
        }
    }

    /** reason = lý do Gemini không viết được (no_key / quota / error) như ai-service trả; null khi mọi mẹo do Gemini viết. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record GenerateResponse(List<Generated> items, String reason) {}

    // ---------- admin ----------

    public record EditRequest(@NotBlank @Size(max = MAX_ADMIN_CHARS) String mnemonicVi) {}

    /** note bắt buộc khi từ chối (kiểm ở service để body rỗng vẫn nhận được với approve). */
    public record ReviewRequest(@Size(max = MAX_NOTE_CHARS) String note) {}

    /** char = chữ CJK thống nhất (水, như thẻ bộ thủ); thiếu khi bảng bộ thủ của ai-service không tra được lúc này. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RadicalRef(int no, @JsonProperty("char") String ch, String nameVi) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AdminItem(UUID id, String kanji, RadicalRef radical, String mnemonicVi, String source, String status,
                            String authorEmail, String generatedModel, Instant createdAt, String reviewedByEmail,
                            Instant reviewedAt, String reviewNote,
                            /* V38: nhãn AI + từ bị đánh dấu cho hàng chờ duyệt (null / rỗng khi chưa chấm) */
                            Integer modLabel, Double modScore, java.util.List<String> modSpans) {
        public static AdminItem of(KanjiMnemonic m, RadicalRef radical, String authorEmail, String reviewedByEmail,
                                   java.util.List<String> modSpans) {
            return new AdminItem(m.getId(), m.getKanji(), radical, m.getMnemonicVi(), m.getSource(), m.getStatus(), authorEmail,
                    m.getGeneratedModel(), m.getCreatedAt(), reviewedByEmail, m.getReviewedAt(), m.getReviewNote(),
                    m.getModLabel(), m.getModScore(), modSpans);
        }
    }
}
