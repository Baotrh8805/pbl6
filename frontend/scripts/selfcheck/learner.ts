// Self-check phần người học đợt 2 (C2): mẹo nhớ, cảnh báo mâu thuẫn, câu i+1, dashboard A5. Hàm thuần, không gọi API.
// scripts/selfCheck.ts gọi: runLearnerChecks((cond, msg) => assertStrictEqual(cond, true, msg)).
import {
    conflictBadgeLabel,
    conflictFieldLabel,
    conflictTooltip,
    conflictsByFieldSummary,
    countConflictItems,
    normalizeConfidence,
    parseConflicts,
    statsConflictCount,
} from "../../src/features/extraction/conflictUtils.ts";
import {
    highlightRuby,
    parseIPlusOne,
    sentenceCountsLabel,
    splitHighlight,
    surfaceSegments,
} from "../../src/features/extraction/iPlusOneUtils.ts";
import {
    MNEMONIC_AI_DOWN_MESSAGE,
    MNEMONIC_USER_MAX,
    mnemonicCharsLeft,
    mnemonicGenerateErrorMessage,
    mnemonicInputError,
    mnemonicOriginLabel,
    mnemonicSubmitErrorMessage,
    parseGenerateResult,
    parseKanjiMnemonics,
    parseRadicalMnemonicSources,
    pendingCount,
    radicalMnemonicSourceLabel,
} from "../../src/features/kanji/mnemonicUtils.ts";
import {
    calcLearningStats,
    dayKey,
    parseReviewActivity,
    streaksFromActivity,
} from "../../src/lib/learningStats.ts";
import { JLPT_TARGET_WORDS, getTargetWordsByLevel } from "../../src/features/dashboard/lib/dashboardUtils.ts";

export function runLearnerChecks(assert: (cond: boolean, msg: string) => void): void {
    const eq = (actual: unknown, expected: unknown, msg: string) =>
        assert(actual === expected, `${msg} (mong đợi "${String(expected)}", nhận "${String(actual)}")`);

    // ---- Cảnh báo mâu thuẫn (F2) ----
    const conflicts = parseConflicts([
        { field: "Reading", document: "よむ", reference: "よみ", source: "JMdict", confidence: 0.85, noteVi: "Tài liệu có thể in sai." },
        { field: "meaning", document: ["to read", "to recite"], reference: "to read", confidence: 85 },
        { field: "level", document: "N4", reference: "N3", source: "JLPT list", confidence: 150 },
        { document: "thiếu field" },
        "rác",
    ]);
    eq(conflicts.length, 3, "Mâu thuẫn thiếu field / không phải object bị bỏ");
    eq(conflicts[0].field, "reading", "field chuẩn hoá chữ thường");
    eq(
        conflictTooltip(conflicts[0]),
        "Cách đọc — Tài liệu: よむ / Chuẩn: よみ (JMdict, độ tin cậy 85%)\nTài liệu có thể in sai.",
        "Tooltip: nhãn trường + Tài liệu / Chuẩn (nguồn, độ tin cậy %) + ghi chú"
    );
    eq(conflictTooltip(conflicts[1]), "Nghĩa — Tài liệu: to read; to recite / Chuẩn: to read (độ tin cậy 85%)", "Mảng nối '; ', độ tin cậy 0..100 hiểu là %");
    eq(conflictTooltip(conflicts[2]), "Cấp JLPT — Tài liệu: N4 / Chuẩn: N3 (JLPT list)", "Độ tin cậy ngoài khoảng -> bỏ phần %");
    eq(conflictTooltip({ field: "x", document: null, reference: null, source: null, confidence: null, noteVi: null }), "Nội dung — Tài liệu: — / Chuẩn: —", "Thiếu hết -> gạch ngang, không ngoặc");
    eq(`${normalizeConfidence(1)}|${normalizeConfidence(-0.1)}|${normalizeConfidence("0.5")}`, "1|null|null", "Độ tin cậy: 1 = 100%, âm / chuỗi -> null");
    eq(conflictFieldLabel("furigana"), "Furigana", "Nhãn trường furigana");
    eq(conflictFieldLabel("toString"), "Nội dung", "Trường lạ (kể cả tên thuộc tính Object) -> nhãn chung");
    eq(conflictBadgeLabel([...conflicts, conflicts[0]]), "Cách đọc, Nghĩa, Cấp JLPT", "Nhãn badge không lặp trường");
    eq(parseConflicts(null).length + parseConflicts({}).length, 0, "conflicts không phải mảng -> []");
    eq(countConflictItems([{ conflicts: [conflicts[0]] }, { conflicts: [] }, {}, { conflicts: "x" }]), 1, "Đếm item có mâu thuẫn");
    eq(`${statsConflictCount({ conflicts: 3 })}|${statsConflictCount({})}|${statsConflictCount(null)}|${statsConflictCount({ conflicts: [1, 2] })}`, "3|null|null|2", "stats.conflicts: số / thiếu / mảng");
    eq(conflictsByFieldSummary({ conflictsByField: { meaning: 1, reading: 3, level: 0, junk: "x" } }), "Cách đọc 3 · Nghĩa 1", "Tóm tắt theo trường: bỏ 0 / lạ, nhiều trước");

    // ---- Dashboard A5: streak từ ngày server, đến hạn / thẻ mới ----
    const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h);
    const today = d(2025, 3, 10);
    const k = (date: Date) => dayKey(date);
    const serverDays = [
        { day: k(d(2025, 3, 7)), reviews: 1, quizzes: 0 },
        { day: k(d(2025, 3, 8)), reviews: 2, quizzes: 0 },
        { day: k(d(2025, 3, 9)), reviews: 0, quizzes: 1 },
        { day: k(d(2025, 3, 10)), reviews: 0, quizzes: 0 },
    ];
    let st = streaksFromActivity({ days: serverDays, currentStreak: null, maxStreak: null }, today);
    eq(`${st.current},${st.max}`, "3,3", "Ngày chỉ làm quiz vẫn tính; hôm nay 0 lượt -> chuỗi tính tới hôm qua");
    st = streaksFromActivity({ days: serverDays, currentStreak: 5, maxStreak: 9 }, today);
    eq(`${st.current},${st.max}`, "5,9", "Server đã tính streak -> dùng số của server");
    st = streaksFromActivity({ days: serverDays, currentStreak: 3, maxStreak: 1 }, today);
    eq(st.max, 3, "Kỷ lục không nhỏ hơn chuỗi hiện tại / số đếm từ ngày");
    eq(streaksFromActivity({ days: [], currentStreak: null, maxStreak: null }, today).current, 0, "Chưa học ngày nào -> 0");

    eq(parseReviewActivity("<html>"), null, "Response không phải object -> null (quay về suy luận)");
    eq(parseReviewActivity({ foo: 1 }), null, "Object không có trường nào dùng được -> null");
    const act = parseReviewActivity({
        days: [
            { day: "2025-03-10", reviews: 3, quizzes: 1 },
            { day: "2025-03-10", reviews: 1, quizzes: 0 },
            { day: "2025-3-9", reviews: 5 },
            { day: "2025-03-08", reviews: -2, quizzes: 1 },
            null,
        ],
        dueToday: 7,
        newCards: 2,
        learnedTotal: 10,
        masteredTotal: 3,
        currentStreak: 1,
        maxStreak: 4,
    });
    assert(act !== null, "Response hợp lệ -> có activity");
    if (act) {
        eq(act.days.map((x) => `${x.day}:${x.reviews}/${x.quizzes}`).join(","), "2025-03-08:0/1,2025-03-10:4/1", "Ngày sai định dạng bị bỏ, ngày lặp cộng dồn, số âm = 0, sắp tăng dần");
        const deck = {
            id: "d1",
            title: "T",
            level: "N5",
            description: null,
            cards: ["c1", "c2", "c3"].map((id) => ({ id, term: id, reading: null, meaning: id })),
        };
        const s = calcLearningStats([deck] as never, {}, [], today, act);
        eq(
            `${s.wordsLearned},${s.consolidatedWords},${s.dueToday},${s.newCards},${s.srsDueCount},${s.reviewedToday},${s.currentStreak},${s.maxStreak},${s.activitySource}`,
            "10,3,7,2,9,4,1,4,server",
            "Có activity: đã học / đã thuộc / đến hạn / thẻ mới / lượt hôm nay / streak lấy từ server"
        );
        eq(s.reviewsLast7Days.join(","), "0,0,0,0,0,0,4", "Lượt ôn 7 ngày theo ngày server");
        const partial = calcLearningStats([deck] as never, {}, [], today, { ...act, dueToday: null, newCards: null });
        eq(`${partial.dueToday},${partial.newCards},${partial.srsDueCount}`, "0,3,3", "Server thiếu dueToday / newCards -> đếm tại chỗ (3 thẻ chưa học)");
    }
    const due = { cardId: "c1", reps: 1, intervalDays: 1, ease: 2.5, dueAt: d(2025, 3, 10, 8).toISOString() };
    const later = { cardId: "c2", reps: 1, intervalDays: 3, ease: 2.5, dueAt: d(2025, 3, 12).toISOString() };
    const local = calcLearningStats(
        [{ id: "d", title: "T", level: "N5", description: null, cards: ["c1", "c2", "c3"].map((id) => ({ id, term: id, reading: null, meaning: id })) }] as never,
        { c1: due, c2: later },
        [],
        today
    );
    eq(`${local.dueToday},${local.newCards},${local.srsDueCount},${local.activitySource}`, "1,1,2,inferred", "Không có activity: tách thẻ đến hạn / thẻ mới, tổng như cũ");

    // Mục tiêu theo cấp phải tăng dần N5 -> N1 (bảng cũ N2 < N3)
    const targets = (["N5", "N4", "N3", "N2", "N1"] as const).map((lv) => JLPT_TARGET_WORDS[lv]);
    assert(targets.every((n, i) => i === 0 || n > targets[i - 1]), `Mục tiêu từ tăng dần theo cấp: ${targets.join(" < ")}`);
    eq(getTargetWordsByLevel("N2") > getTargetWordsByLevel("N3"), true, "N2 cần nhiều từ hơn N3");
    eq(getTargetWordsByLevel("toString"), JLPT_TARGET_WORDS.N5, "Cấp lạ -> mục tiêu N5");

    // ---- Câu i+1 ----
    const parts = splitHighlight("今日は本を読んだ。", ["読んだ", "読む"]);
    eq(parts ? `${parts.before}[${parts.match}]${parts.after}` : "null", "今日は本を[読んだ]。", "Tô dạng gặp trong câu");
    const lemmaParts = splitHighlight("本を読む。", ["読んだ", null, "読む"]);
    eq(lemmaParts?.match ?? "null", "読む", "Không thấy dạng gặp -> thử lemma");
    eq(splitHighlight("本を読む。", ["", "  ", "書く"]), null, "Không thấy từ đích -> null (hiện nguyên câu)");
    const firstOnly = splitHighlight("本と本", ["本"]);
    eq(firstOnly ? `${firstOnly.before}|${firstOnly.after}` : "null", "|と本", "Chỉ tô lần xuất hiện đầu");
    const seg = (s: { kanji: string; kana: string }[] | null) => (s ? s.map((x) => `${x.kanji}:${x.kana}`).join("|") : "null");
    const yomu = [{ kanji: "読", kana: "よ" }, { kanji: "む", kana: "む" }];
    eq(seg(surfaceSegments("読んだ", yomu)), "読:よ|んだ:んだ", "Furigana dạng chia: giữ đoạn kanji, đuôi biến đổi lấy từ dạng gặp");
    eq(seg(surfaceSegments("読む", yomu)), "読:よ|む:む", "Dạng gặp = lemma -> đủ đoạn");
    eq(seg(surfaceSegments("よんだ", yomu)), "null", "Đoạn kanji không khớp -> không gắn furigana sai");
    eq(seg(surfaceSegments("する", [{ kanji: "する", kana: "する" }])), "null", "Toàn kana -> không cần furigana");
    const r1 = highlightRuby("読む", { lemma: "読む", reading: "よむ", readingSegments: null });
    const r2 = highlightRuby("読んだ", { lemma: "読む", reading: "よむ", readingSegments: null });
    eq(`${r1.reading}|${r2.reading}`, "よむ|null", "Không có đoạn: chỉ gắn cách đọc khi dạng gặp = lemma");
    const ip = parseIPlusOne({
        items: [
            { sentence: "本を読む。", target: { lemma: "読む", reading: "よむ", level: "N5" }, unknownCount: 1, knownCount: 2, itemId: 42 },
            { sentence: "本を読む。", target: { lemma: "読む" } },
            { sentence: "", target: { lemma: "x" } },
            { sentence: "猫が好き。", target: { surface: "好き", level: "N9", readingSegments: [{ kanji: "好" }] } },
            { sentence: "犬。" },
        ],
        knownCount: 12.4,
    });
    eq(ip.items.length, 2, "Câu trùng / rỗng / thiếu từ đích bị bỏ");
    eq(`${ip.items[0].itemId}|${ip.items[0].target.surface}|${ip.knownCount}`, "42|読む|12", "itemId số -> chuỗi; surface thiếu = lemma; knownCount làm tròn");
    eq(`${ip.items[1].target.lemma}|${ip.items[1].target.level}|${ip.items[1].target.readingSegments}|${ip.items[1].itemId}`, "好き|null|null|null", "Lemma thiếu dùng surface; cấp lạ / đoạn hỏng -> null");
    eq(sentenceCountsLabel(ip.items[0]), "1 từ mới · 2 từ đã biết", "Nhãn số từ mới / đã biết");
    eq(parseIPlusOne(null).items.length, 0, "Response rỗng -> không câu nào");

    // ---- Mẹo nhớ (C4) ----
    const mn = parseKanjiMnemonics(
        {
            approved: { id: "a", mnemonicVi: "  Người tựa cây  ", source: "ai" },
            mine: [
                { id: 1, mnemonicVi: "cũ", status: "rejected", reviewNote: "Sai bộ", createdAt: "2026-10-01T00:00:00Z" },
                { id: 2, mnemonicVi: "mới", source: "USER", createdAt: "2026-10-02T00:00:00Z" },
                { id: 2, mnemonicVi: "trùng" },
                { id: 3 },
            ],
        },
        "休"
    );
    eq(`${mn.kanji}|${mn.approved?.mnemonicVi}|${mn.approved?.source}`, "休|Người tựa cây|AI", "Mẹo đã duyệt: cắt khoảng trắng, nguồn không phân biệt hoa thường");
    eq(mn.mine.map((m) => `${m.id}:${m.status}`).join(","), "2:PENDING,1:REJECTED", "Mẹo của mình: mới nhất trước, thiếu status = PENDING, bỏ trùng / thiếu nội dung");
    eq(pendingCount(mn.mine), 1, "Đếm mẹo chờ duyệt");
    const empty = parseKanjiMnemonics(null, "休");
    eq(`${empty.kanji}|${empty.approved}|${empty.mine.length}`, "休|null|0", "Response hỏng -> chưa có mẹo");
    eq(`${mnemonicOriginLabel("USER", true)}|${mnemonicOriginLabel("USER", false)}|${mnemonicOriginLabel(null, true)}`, "Bạn tự viết|Người học viết|null", "Nhãn nguồn mẹo");
    assert(mnemonicInputError("   ") !== null, "Mẹo rỗng -> lỗi");
    assert(mnemonicInputError("a".repeat(MNEMONIC_USER_MAX + 1)) !== null, "Mẹo quá 300 ký tự -> lỗi");
    eq(mnemonicInputError("休 = người tựa cây"), null, "Mẹo hợp lệ");
    eq(mnemonicCharsLeft("  abc  "), MNEMONIC_USER_MAX - 3, "Đếm ký tự sau khi cắt khoảng trắng");
    const gen = parseGenerateResult({ items: [{ id: "g", kanji: "休", mnemonicVi: "m", source: "TEMPLATE" }, { id: "x" }], reason: "quota" });
    eq(`${gen.items.length}|${gen.items[0].status}|${gen.items[0].source}|${gen.reason}`, "1|PENDING|TEMPLATE|quota", "Kết quả AI gợi ý luôn chờ duyệt");
    const sources = parseRadicalMnemonicSources({
        items: [
            { kanji: "休", mnemonicVi: "m", mnemonicSource: "APPROVED" },
            { kanji: "体", mnemonicVi: null, mnemonicSource: "template" },
            { kanji: "木", mnemonicVi: "t", mnemonicSource: "template" },
            { kanji: "林", mnemonicVi: "x", mnemonicSource: "weird" },
        ],
    });
    eq(Object.entries(sources).map(([kk, v]) => `${kk}:${v}`).join(","), "休:approved,木:template", "Nguồn mẹo thẻ bộ thủ: giữ approved, bỏ chữ không có mẹo / nguồn lạ");
    eq(`${radicalMnemonicSourceLabel("approved")}|${radicalMnemonicSourceLabel(undefined)}`, "Đã duyệt|null", "Nhãn mẹo đã duyệt");

    // ---- Câu lỗi gửi / sinh mẹo: câu của server luôn thắng (409 có hai trần khác nhau) ----
    // Body lỗi đúng dạng ApiExceptionHandler: {status, error, message}.
    const apiErr = (status: number, message?: string, error = "Conflict") => ({
        response: { status, data: message === undefined ? "" : { status, error, message } },
    });
    const perUser = "Bạn đã có 50 mẹo nhớ đang chờ duyệt (tối đa 50). Hãy đợi quản trị duyệt bớt rồi gửi tiếp.";
    const perKanji = "Bạn đã có 3 mẹo nhớ đang chờ duyệt cho chữ 休.";
    eq(mnemonicSubmitErrorMessage(apiErr(409, perUser)), perUser, "Gửi mẹo: 409 trần 50 mẹo/người -> đúng câu của server, không phải câu '3 mẹo cho chữ này'");
    eq(mnemonicSubmitErrorMessage(apiErr(409, perKanji)), perKanji, "Gửi mẹo: 409 trần 3 mẹo/chữ -> câu của server");
    assert(/3/.test(mnemonicSubmitErrorMessage(apiErr(409)) ?? "") && /50/.test(mnemonicSubmitErrorMessage(apiErr(409)) ?? ""), "Gửi mẹo: 409 body trống -> câu dự phòng nói cả hai trần");
    assert(/50/.test(mnemonicSubmitErrorMessage(apiErr(409, "Conflict")) ?? ""), "Gửi mẹo: message chỉ là reason phrase 'Conflict' -> câu dự phòng tiếng Việt");
    eq(mnemonicSubmitErrorMessage(apiErr(400, "Chỉ nhận đúng một chữ Hán.", "Bad Request")), "Chỉ nhận đúng một chữ Hán.", "Gửi mẹo: 400 -> câu của server");
    eq(mnemonicSubmitErrorMessage(new Error("Network Error")), null, "Gửi mẹo: lỗi mạng -> null (nơi gọi dùng extractErrorMessage)");
    const tooMany = "Bạn đã sinh mẹo nhớ quá nhiều lần, vui lòng thử lại sau.";
    eq(mnemonicGenerateErrorMessage(apiErr(429, tooMany, "Too Many Requests")), tooMany, "Sinh mẹo: 429 -> câu của server");
    eq(mnemonicGenerateErrorMessage(apiErr(409, perUser)), perUser, "Sinh mẹo: 409 trần 50 mẹo -> câu của server");
    assert(/lượt/.test(mnemonicGenerateErrorMessage(apiErr(429)) ?? ""), "Sinh mẹo: 429 body trống -> câu dự phòng");
    eq(
        mnemonicGenerateErrorMessage(apiErr(503, "Không kết nối được dịch vụ AI (sinh mẹo nhớ bộ thủ). Hãy chắc ai-service đang chạy.", "Service Unavailable")),
        MNEMONIC_AI_DOWN_MESSAGE,
        "Sinh mẹo: 503 -> câu thân thiện (message 503 viết cho người vận hành)"
    );

}
