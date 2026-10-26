package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.Deck;
import com.pbl6.flashcard.model.Flashcard;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

/**
 * Xuất bộ thẻ (UC-29, kế hoạch 2026-10-26 B2). Hàm thuần sinh nội dung; quyền kiểm ở DeckService.readable (chủ, người được chia sẻ,
 * bộ công khai, thư mục được chia sẻ). PDF làm ở frontend (trang in /decks/:id/print + "Lưu PDF" của trình duyệt).
 * <ul>
 *   <li>csv: UTF-8 có BOM (Excel đọc đúng tiếng Việt / Nhật), cột term,reading,meaning,level,han_viet,pos theo RFC 4180; ô bắt đầu
 *       bằng = + - @ được thêm dấu ' để không thành công thức khi mở bằng bảng tính.</li>
 *   <li>anki: văn bản tách tab cho Anki (File → Import): dòng #separator:tab / #html:true, mặt trước = thuật ngữ, mặt sau = cách
 *       đọc + nghĩa (xuống dòng = &lt;br&gt;), Hán-Việt; nội dung được escape HTML.</li>
 * </ul>
 */
@Service
public class DeckExportService {

    public static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");

    public record Export(byte[] body, String contentType, String fileName) {}

    private final DeckService decks;

    public DeckExportService(DeckService decks) {
        this.decks = decks;
    }

    /** Xuất bộ uid xem được (không xem được = 404 như mọi API bộ thẻ). Ngày trong tên tệp theo giờ Việt Nam. */
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public Export exportFor(Long uid, String deckId, String format) {
        return export(decks.readable(uid, deckId), format, LocalDate.now(VN));
    }

    public Export export(Deck deck, String format, LocalDate today) {
        List<Flashcard> cards = deck.getCards().stream()
                .sorted(Comparator.comparing(Flashcard::getPosition, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        String base = slug(deck.getTitle()) + "-" + today;
        return switch (format == null ? "csv" : format.toLowerCase(Locale.ROOT)) {
            case "csv" -> new Export(csv(cards), "text/csv; charset=UTF-8", base + ".csv");
            case "anki" -> new Export(anki(cards).getBytes(StandardCharsets.UTF_8), "text/plain; charset=UTF-8", base + "-anki.txt");
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Định dạng xuất chỉ nhận csv hoặc anki.");
        };
    }

    static byte[] csv(List<Flashcard> cards) {
        StringBuilder sb = new StringBuilder("﻿");
        sb.append("term,reading,meaning,level,han_viet,pos\r\n");
        for (Flashcard c : cards) {
            sb.append(cell(c.getTerm())).append(',').append(cell(c.getReading())).append(',').append(cell(c.getMeaning()))
                    .append(',').append(cell(c.getLevel())).append(',').append(cell(c.getHanViet())).append(',')
                    .append(cell(c.getPos())).append("\r\n");
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    static String cell(String v) {
        if (v == null) return "";
        String s = v;
        if (!s.isEmpty() && "=+-@".indexOf(s.charAt(0)) >= 0) s = "'" + s;
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    static String anki(List<Flashcard> cards) {
        StringBuilder sb = new StringBuilder("#separator:tab\n#html:true\n#columns:Front\tBack\n");
        for (Flashcard c : cards) {
            StringBuilder back = new StringBuilder();
            if (c.getReading() != null && !c.getReading().isBlank() && !Objects.equals(c.getReading(), c.getTerm())) {
                back.append(html(c.getReading())).append("<br>");
            }
            back.append(html(c.getMeaning()));
            if (c.getHanViet() != null && !c.getHanViet().isBlank()) back.append("<br><i>").append(html(c.getHanViet())).append("</i>");
            sb.append(html(c.getTerm())).append('\t').append(back).append('\n');
        }
        return sb.toString();
    }

    /** Escape HTML, xuống dòng → &lt;br&gt;, tab → khoảng trắng (tab là dấu tách cột). */
    static String html(String v) {
        if (v == null) return "";
        return v.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\t", " ")
                .replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br>");
    }

    /** Tên tệp ASCII an toàn từ tiêu đề (bỏ dấu tiếng Việt; chữ Nhật bỏ đi), rỗng → "bo-the". */
    static String slug(String title) {
        String s = Normalizer.normalize(title == null ? "" : title, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .replace('đ', 'd').replace('Đ', 'D').toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-+|-+$)", "");
        if (s.length() > 60) s = s.substring(0, 60).replaceAll("-+$", "");
        return s.isEmpty() ? "bo-the" : s;
    }
}
