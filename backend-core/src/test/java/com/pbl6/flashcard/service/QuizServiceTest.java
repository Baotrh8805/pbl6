package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.Flashcard;
import com.pbl6.flashcard.service.QuizAiClient.ConjugationItem;
import com.pbl6.flashcard.service.QuizService.BankEntry;
import com.pbl6.flashcard.service.QuizService.Built;
import com.pbl6.flashcard.service.QuizService.Item;
import com.pbl6.flashcard.service.QuizService.Sources;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class QuizServiceTest {

    private static List<Flashcard> cards(int n) {
        List<Flashcard> list = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            Flashcard c = new Flashcard();
            c.setId("c" + i);
            c.setTerm("term" + i);
            c.setMeaning("nghĩa" + i);
            list.add(c);
        }
        return list;
    }

    @Test
    void boTheQuaNhoKhongRaCauHoiThieuLuaChon() {
        assertEquals(0, QuizService.buildQuiz(cards(1), 5, new Random(1)).size(), "1 thẻ: không có lựa chọn nhiễu");
        List<Flashcard> same = cards(3);
        same.forEach(c -> c.setMeaning("cùng nghĩa"));
        assertEquals(0, QuizService.buildQuiz(same, 5, new Random(1)).size(), "mọi thẻ cùng nghĩa");
        QuizService.buildQuiz(cards(2), 5, new Random(1)).forEach(q -> assertEquals(2, q.options().size()));
    }

    @Test
    void headlineLayDongDauKhongRong() {
        assertEquals("định nghĩa 1", QuizService.headline("\n  định nghĩa 1  \n\nVí dụ: ...\nGhi chú"));
        assertEquals("", QuizService.headline("  \n "));
    }

    @Test
    void luaChonQuizChiGomDongDauCuaNoiDung() {
        List<Flashcard> list = cards(4);
        list.forEach(c -> c.setMeaning(c.getMeaning() + "\n\nVí dụ dài dòng"));
        for (QuizService.Question q : QuizService.buildQuiz(list, 4, new Random(1))) {
            q.options().forEach(o -> assertFalse(o.contains("\n") || o.contains("Ví dụ"), o));
        }
    }

    @Test
    void deTronDuAppAnVaKhongLoDapAn() {
        List<QuizService.Question> quiz = QuizService.buildQuiz(cards(10), 5, new Random(1));
        assertEquals(5, quiz.size());
        for (QuizService.Question q : quiz) {
            assertEquals(QuizService.OPTIONS, q.options().size());
            assertEquals(QuizService.OPTIONS, q.options().stream().distinct().count(), "Không lựa chọn trùng");
            assertTrue(q.options().contains("nghĩa" + q.cardId().substring(1)), "Đáp án đúng phải nằm trong lựa chọn");
            assertEquals("meaning", q.type(), "xem trước = câu nghĩa");
            assertEquals("choice", q.inputMode());
        }
    }

    @Test
    void boTheItThePhaiKhongNo() {
        List<QuizService.Question> quiz = QuizService.buildQuiz(cards(2), 10, new Random(1));
        assertEquals(2, quiz.size(), "size lớn hơn số thẻ -> cắt về số thẻ");
        assertEquals(2, quiz.get(0).options().size(), "Không đủ nghĩa thì ít lựa chọn hơn");
    }

    @Test
    void chamDiemBoQuaCardIdLa() {
        Map<String, String> meanings = Map.of("c0", "nghĩa0", "c1", "nghĩa1", "c2", "nghĩa2");
        QuizService.Graded g = QuizService.grade(meanings, List.of("c0", "c1"), Map.of(
                "c0", "nghĩa0",
                "c1", "nghĩa-sai",
                "c2", "nghĩa2", // thẻ của bộ nhưng không nằm trong đề đã phát
                "hacker", "nghĩa0"));
        assertEquals(1, g.score());
        assertEquals(2, g.total(), "chỉ tính các câu đã phát");
        assertEquals(List.of("c1"), g.wrongCardIds());
    }

    @Test
    void cauBoTrongTinhLaSai() {
        Map<String, String> meanings = Map.of("c0", "nghĩa0", "c1", "nghĩa1", "c2", "nghĩa2");
        // Chỉ nộp 1 câu đúng không được 1/1 = 100%
        QuizService.Graded g = QuizService.grade(meanings, List.of("c0", "c1", "c2"), Map.of("c0", "nghĩa0"));
        assertEquals(1, g.score());
        assertEquals(3, g.total());
        assertEquals(List.of("c1", "c2"), g.wrongCardIds());
        // Thẻ bị xoá sau khi phát đề: không tính vào tổng
        assertEquals(1, QuizService.grade(Map.of("c0", "nghĩa0"), List.of("c0", "gone"), Map.of()).total());
    }

    // ---------- quiz đa loại (hợp đồng đợt 2 §1.2) ----------

    private static Flashcard card(String id, String term, String reading, String meaning) {
        Flashcard c = new Flashcard();
        c.setId(id);
        c.setTerm(term);
        c.setReading(reading);
        c.setMeaning(meaning);
        return c;
    }

    private static List<Flashcard> vocab() {
        return new ArrayList<>(List.of(
                card("c0", "水", "みず", "nước"),
                card("c1", "火", "ひ", "lửa"),
                card("c2", "山", "やま", "núi"),
                card("c3", "学校", "がっこう", "trường học\nVí dụ: 学校へ行く")));
    }

    private static Map<String, Object> lookalikes(String... terms) {
        List<Map<String, Object>> look = new ArrayList<>();
        for (String t : terms) look.add(Map.of("term", t, "reading", "x"));
        return Map.of("kanjiLookalike", look, "homophones", List.of());
    }

    private static Built built(List<Built> list, String cardId) {
        return list.stream().filter(b -> b.item().cardId().equals(cardId)).findFirst()
                .orElseThrow(() -> new AssertionError("không có câu của " + cardId));
    }

    private static Item item(List<Built> list, String cardId) {
        return built(list, cardId).item();
    }

    @Test
    void loaiCauXoayVongTheoThuTuGuiLenKhiTheHoTroMoiLoai() {
        List<Built> list = QuizService.build(vocab(), 4, new Random(3), List.of("meaning", "reading"), Sources.NONE);
        assertEquals(List.of("meaning", "reading", "meaning", "reading"),
                list.stream().map(b -> b.item().type()).toList(), "mỗi thẻ một câu, loại đổi lần lượt");
        for (Built b : list) {
            Item i = b.item();
            if ("reading".equals(i.type())) {
                assertEquals("typing", i.inputMode());
                assertEquals(List.of(), i.options(), "câu gõ không có phương án");
                assertTrue(i.prompt().contains(i.term()));
                assertEquals("READING", b.draft().kind());
                assertNull(b.draft().options(), "ngân hàng: options NULL = câu gõ");
                assertEquals("RULE", b.draft().generator());
            } else {
                assertEquals("choice", i.inputMode());
                assertNull(i.prompt(), "câu nghĩa không gửi prompt (chế độ chỉ nghe không lộ từ)");
                assertEquals(i.term(), b.draft().prompt(), "ngân hàng lưu thuật ngữ làm prompt của câu nghĩa");
                assertEquals(b.draft().options().stream().sorted().toList(), b.draft().options(), "options lưu đã sắp xếp");
                assertEquals(Set.copyOf(i.options()), Set.copyOf(b.draft().options()));
            }
        }
    }

    @Test
    void theKhongHoTroLoaiDaChonThiRaCauNghiaVaTheHoTroDuocUuTien() {
        List<Flashcard> cards = vocab();
        cards.get(2).setDistractors(lookalikes("岩", "出"));
        // Chỉ chọn kanji_lookalike, đề 1 câu: thẻ duy nhất có chữ giống hình phải được chọn dù đứng ở đâu sau khi trộn
        for (int seed = 0; seed < 5; seed++) {
            List<Built> one = QuizService.build(cards, 1, new Random(seed), List.of("kanji_lookalike"), Sources.NONE);
            assertEquals("c2", one.get(0).item().cardId(), "seed " + seed);
        }
        List<Built> list = QuizService.build(cards, 4, new Random(1), List.of("kanji_lookalike"), Sources.NONE);
        assertEquals(4, list.size());
        Built look = built(list, "c2");
        assertEquals("kanji_lookalike", look.item().type());
        assertEquals("山", look.item().correct());
        assertEquals(Set.of("山", "岩", "出"), Set.copyOf(look.item().options()));
        assertEquals("Chữ nào có nghĩa 'núi' (やま)?", look.item().prompt());
        assertEquals("AI", look.draft().generator(), "phương án nhiễu do ai-service sinh");
        list.stream().map(Built::item).filter(i -> !i.cardId().equals("c2"))
                .forEach(i -> assertEquals("meaning", i.type(), "thẻ không có chữ giống hình -> câu nghĩa"));
    }

    @Test
    void cauGoChamSauKhiChuanHoaKanaVaNhanNhieuCachDoc() {
        Item reading = QuizService.build(List.of(card("c3", "学校", "がっこう", "trường học")), 1, new Random(1),
                List.of("reading"), Sources.NONE).get(0).item();
        assertTrue(reading.typingInput());
        assertTrue(reading.accepts("がっこう"));
        assertTrue(reading.accepts("ガッコウ"), "katakana -> hiragana");
        assertTrue(reading.accepts(" が っ こ う。"), "bỏ khoảng trắng và dấu câu");
        assertTrue(reading.accepts("ｶﾞｯｺｳ"), "katakana nửa độ rộng");
        assertFalse(reading.accepts("がこう"));
        assertFalse(reading.accepts("。"), "chỉ có dấu câu = rỗng sau chuẩn hoá");
        assertFalse(reading.accepts(""));
        assertFalse(reading.accepts(null));
        assertTrue(reading.allows("bất kỳ"), "câu gõ không kiểm theo phương án");

        // Thẻ ghi nhiều cách đọc: gõ một cách là đủ; "・" không phải dấu ngăn (nằm giữa từ ghép)
        assertEquals(Set.of("かく", "えがく"), QuizService.typingAnswers("かく、えがく"));
        assertEquals(Set.of("なま", "せい"), QuizService.typingAnswers("なま / セイ"));
        assertEquals(Set.of("こーひーかっぷ"), QuizService.typingAnswers("コーヒー・カップ"));

        // Thẻ toàn kana không có reading: chính term là đáp án; thẻ chữ Hán không reading: không ra câu gõ -> câu nghĩa
        List<Built> mixed = QuizService.build(List.of(card("k", "コーヒー", null, "cà phê"), card("h", "猫", null, "mèo")), 2,
                new Random(1), List.of("reading"), Sources.NONE);
        assertEquals("reading", item(mixed, "k").type());
        assertEquals("コーヒー", item(mixed, "k").correct(), "đáp án giữ nguyên cách viết của thẻ");
        assertTrue(item(mixed, "k").accepts("こーひー"));
        assertEquals("meaning", item(mixed, "h").type());

        QuizService.Graded g = QuizService.grade(List.of(reading), List.of("c3"), Map.of("c3", "ガッコウ"));
        assertEquals(1, g.score(), "chấm theo câu của bản chụp: câu gõ so sau chuẩn hoá");
    }

    @Test
    void cauDaAnKhongBaoGioDuocPhatLaiMaSinhCauKhac() {
        List<Flashcard> cards = List.of(card("c0", "水", "みず", "nước"), card("c1", "火", "ひ", "lửa"));
        // Bộ 2 thẻ chỉ có đúng một câu nghĩa cho c0; admin đã ẩn câu đó
        BankEntry hidden = new BankEntry("q-hidden", "c0", "MEANING", "水", List.of("lửa", "nước"), "nước",
                Map.of("cardHash", QuizService.cardHash(cards.get(0))), true);
        Sources sources = new Sources(Map.of(), Map.of("c0", List.of(hidden)));

        List<Built> meaningOnly = QuizService.build(cards, 2, new Random(1), List.of("meaning"), sources);
        assertEquals(List.of("c1"), meaningOnly.stream().map(b -> b.item().cardId()).toList(),
                "không sinh được câu khác -> thẻ không có câu nghĩa");

        List<Built> withReading = QuizService.build(cards, 2, new Random(1), List.of("meaning", "reading"), sources);
        assertEquals("reading", item(withReading, "c0").type(), "câu nghĩa bị ẩn -> loại khác thẻ hỗ trợ");
        withReading.forEach(b -> assertNotEquals("q-hidden", b.item().questionId()));

        // Bộ lớn hơn: sinh lại ra bộ phương án khác (nội dung khác câu đã ẩn) chứ không bỏ thẻ
        List<Flashcard> big = vocab();
        big.add(card("c4", "猫", "ねこ", "mèo"));
        big.add(card("c5", "犬", "いぬ", "chó"));
        BankEntry hiddenBig = new BankEntry("q-h2", "c0", "MEANING", "水", List.of("lửa", "nước", "núi", "trường học"),
                "nước", Map.of("cardHash", QuizService.cardHash(big.get(0))), true);
        for (int seed = 0; seed < 5; seed++) {
            List<Built> list = QuizService.build(big, big.size(), new Random(seed), List.of("meaning"),
                    new Sources(Map.of(), Map.of("c0", List.of(hiddenBig))));
            assertEquals(big.size(), list.size(), "seed " + seed);
            assertNotEquals(Set.copyOf(hiddenBig.options()), Set.copyOf(item(list, "c0").options()), "seed " + seed);
        }
    }

    @Test
    void nganHangDuBienTheThiBocCauDaCoKeCaBanAdminSua() {
        List<Flashcard> cards = vocab();
        String hash = QuizService.cardHash(cards.get(0));
        List<BankEntry> entries = new ArrayList<>();
        for (int i = 0; i < QuizService.BANK_VARIANTS; i++) {
            // Admin sửa đáp án cả ba biến thể -> phát đề phải dùng đúng bản sửa
            entries.add(new BankEntry("q" + i, "c0", "MEANING", "水", List.of("nước (sửa)", "lửa", "núi"), "nước (sửa)",
                    Map.of("cardHash", hash), false));
        }
        Sources sources = new Sources(Map.of(), Map.of("c0", entries));
        Built fromBank = built(QuizService.build(cards, 4, new Random(2), List.of("meaning"), sources), "c0");
        assertTrue(Set.of("q0", "q1", "q2").contains(fromBank.item().questionId()));
        assertNull(fromBank.draft(), "bốc từ ngân hàng: không ghi gì");
        assertEquals("nước (sửa)", fromBank.item().correct());
        assertNull(fromBank.item().prompt(), "prompt = thuật ngữ -> không gửi");

        // Thẻ bị sửa nghĩa: vân tay đổi -> câu cũ không còn dùng, sinh câu mới theo nội dung mới
        cards.get(0).setMeaning("nước uống");
        Built fresh = built(QuizService.build(cards, 4, new Random(2), List.of("meaning"), sources), "c0");
        assertNull(fresh.item().questionId());
        assertEquals("nước uống", fresh.item().correct());
        assertNotNull(fresh.draft(), "câu mới cần ghi vào ngân hàng");
    }

    @Test
    void cauCuTrungNoiDungNhungTheDaSuaThiCapNhatDongDo() {
        Flashcard c = card("c3", "学校", "がっこう", "trường học");
        // Câu gõ cũ sinh khi thẻ còn ghi sai cách đọc: cùng prompt (prompt không chứa đáp án) nhưng vân tay khác
        BankEntry stale = new BankEntry("q-old", "c3", "READING", "Cách đọc của 「学校」 là gì?", null, "がこう",
                Map.of("cardHash", "khac"), false);
        Built b = QuizService.build(List.of(c), 1, new Random(1), List.of("reading"),
                new Sources(Map.of(), Map.of("c3", List.of(stale)))).get(0);
        assertEquals("q-old", b.item().questionId(), "giữ id (và các báo lỗi) của dòng cũ");
        assertEquals("q-old", b.draft().refreshId());
        assertEquals("がっこう", b.item().correct(), "đáp án theo thẻ hiện tại");
    }

    @Test
    void khoaNoiDungKhongKeThuTuPhuongAn() {
        assertEquals(QuizService.contentKey("p", List.of("b", "a")), QuizService.contentKey("p", List.of("a", "b")));
        assertEquals(QuizService.contentKey("p", null), QuizService.contentKey("p", List.of()), "câu gõ: null = rỗng");
        assertNotEquals(QuizService.contentKey("p", List.of("a")), QuizService.contentKey("p", null));
        assertNotEquals(QuizService.contentKey("p", List.of("a", "b")), QuizService.contentKey("q", List.of("a", "b")));
        assertEquals(Set.of("k1"), QuizService.supersededKeys(Map.of("supersedes", List.of("k1", 7))), "bỏ phần tử không phải chuỗi");
        assertEquals(Set.of(), QuizService.supersededKeys(Map.of("supersedes", "k1")));
    }

    @Test
    void noiDungGocCuaCauAdminDaSuaPhuongAnThiPhatBanSuaKhongGhiDongMoi() {
        // Đúng 3 ứng viên chữ giống hình: câu chọn đúng chữ sinh lần nào cũng ra cùng bộ phương án 山 岩 出 仙
        List<Flashcard> cards = vocab();
        cards.get(2).setDistractors(lookalikes("岩", "出", "仙"));
        QuizService.Draft original = built(QuizService.build(cards, 4, new Random(1), List.of("kanji_lookalike"), Sources.NONE),
                "c2").draft();
        Map<String, Object> extra = Map.of("cardHash", QuizService.cardHash(cards.get(2)),
                "supersedes", List.of(QuizService.contentKey(original.prompt(), original.options())));
        // Admin bỏ phương án 仙 bị báo lỗi (PATCH options): md5 nội dung đổi nên nội dung gốc không còn khớp dòng nào
        BankEntry edited = new BankEntry("q-edit", "c2", "KANJI_LOOKALIKE", original.prompt(), List.of("出", "屮", "山", "岩"),
                "山", extra, false);
        for (int seed = 0; seed < 5; seed++) {
            Built b = built(QuizService.build(cards, 4, new Random(seed), List.of("kanji_lookalike"),
                    new Sources(Map.of(), Map.of("c2", List.of(edited)))), "c2");
            assertEquals("q-edit", b.item().questionId(), "seed " + seed);
            assertNull(b.draft(), "không ghi nội dung gốc thành dòng mới");
            assertEquals(Set.of("山", "岩", "出", "屮"), Set.copyOf(b.item().options()));
            assertEquals(original.prompt(), b.item().prompt());
        }

        // Câu đã sửa bị ẩn: nội dung gốc cũng coi như bị ẩn -> thẻ ra câu nghĩa
        BankEntry hidden = new BankEntry("q-edit", "c2", "KANJI_LOOKALIKE", original.prompt(), List.of("出", "屮", "山", "岩"),
                "山", extra, true);
        Item fallback = item(QuizService.build(cards, 4, new Random(1), List.of("kanji_lookalike"),
                new Sources(Map.of(), Map.of("c2", List.of(hidden)))), "c2");
        assertEquals("meaning", fallback.type());
    }

    @Test
    void suaPromptCauGoCoHieuLucToiKhiTheDoi() {
        Flashcard c = card("c3", "学校", "がっこう", "trường học");
        String original = "Cách đọc của 「学校」 là gì?";
        BankEntry edited = new BankEntry("q-r", "c3", "READING", "Đọc 「学校」 thế nào?", null, "がっこう",
                Map.of("cardHash", QuizService.cardHash(c), "supersedes", List.of(QuizService.contentKey(original, null))), false);
        Sources sources = new Sources(Map.of(), Map.of("c3", List.of(edited)));
        Built b = QuizService.build(List.of(c), 1, new Random(1), List.of("reading"), sources).get(0);
        assertEquals("q-r", b.item().questionId(), "prompt cố định sinh lại -> về đúng câu admin đã sửa");
        assertEquals("Đọc 「学校」 thế nào?", b.item().prompt());
        assertNull(b.draft());

        // Thẻ sửa cách đọc: vân tay đổi -> bản sửa hết hiệu lực, câu theo nội dung thẻ mới được ghi như thường
        c.setReading("がくこう");
        Built after = QuizService.build(List.of(c), 1, new Random(1), List.of("reading"), sources).get(0);
        assertNull(after.item().questionId());
        assertEquals(original, after.draft().prompt());
        assertNull(after.draft().refreshId());
        assertEquals("がくこう", after.item().correct());
    }

    @Test
    void cauChiaDongTuLayTuKetQuaAiVaCoCauViDu() {
        Flashcard verb = card("v", "書く", "かく", "viết");
        verb.setPos("動詞");
        List<Flashcard> cards = vocab();
        cards.add(verb);
        ConjugationItem ci = new ConjugationItem("書く", "書く", "かく", "godan", "te", "thể て",
                "Chia động từ 「書く（かく）」 sang thể て.", "書いて", List.of("書きて", "書いて", "書って", "書かて"),
                "手紙を書いてください。");
        List<Built> list = QuizService.build(cards, 5, new Random(4), List.of("conjugation"),
                new Sources(Map.of("v", List.of(ci)), Map.of()));
        assertEquals("v", list.get(0).item().cardId(), "thẻ hỗ trợ loại đã chọn được ưu tiên");
        Built conj = built(list, "v");
        assertEquals("conjugation", conj.item().type());
        assertEquals("Chia động từ 「書く（かく）」 sang thể て.", conj.item().prompt());
        assertEquals("書いて", conj.item().correct());
        assertEquals("手紙を書いてください。", conj.item().example());
        assertEquals(Set.copyOf(ci.options()), Set.copyOf(conj.item().options()));
        assertEquals("AI", conj.draft().generator());
        assertEquals("te", conj.draft().extra().get("form"));
        list.stream().filter(b -> !b.item().cardId().equals("v"))
                .forEach(b -> assertEquals("meaning", b.item().type(), "không phải động từ -> câu nghĩa"));

        // ai-service trả câu hỏng (đáp án không nằm trong phương án) -> không dùng, thẻ ra câu nghĩa
        ConjugationItem broken = new ConjugationItem("書く", "書く", "かく", "godan", "te", "thể て", "p", "書いて",
                List.of("書きて", "書って"), null);
        assertEquals("meaning", item(QuizService.build(cards, 5, new Random(4), List.of("conjugation"),
                new Sources(Map.of("v", List.of(broken)), Map.of())), "v").type());
    }

    @Test
    void danhSachLoaiBoTrungGiuThuTuVaMacDinhLaMeaning() {
        assertEquals(List.of("meaning"), QuizService.normalizeTypes(null));
        assertEquals(List.of("meaning"), QuizService.normalizeTypes(List.of()));
        assertEquals(List.of("reading", "meaning"), QuizService.normalizeTypes(List.of("reading", "meaning", "reading")));
    }
}
