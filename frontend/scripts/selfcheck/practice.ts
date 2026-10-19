// Self-check cho gói B (luyện tập E2–E4 + xác thực email A1 + khiếu nại G1). scripts/selfCheck.ts gọi
// runPracticeChecks((cond, msg) => assertStrictEqual(cond, true, msg)). Chỉ import file thuần (đường dẫn tương đối + .ts).
import {
    SERVER_PENDING_MESSAGE,
    apiErrorText,
    errorCodeOf,
    errorMessageOf,
    httpStatusOf,
    isEndpointMissing,
} from "../../src/lib/apiErrorInfo.ts";
import {
    APPEAL_MAX,
    APPEAL_MIN,
    REGISTER_DEFAULT_MESSAGE,
    cooldownSecondsLeft,
    loginErrorKind,
    parseRegisterResponse,
    validateAppeal,
} from "../../src/features/auth/authUtils.ts";
import {
    MAX_CONTOUR_POINTS,
    clipText,
    downsampleContour,
    formatPracticeAvg,
    mapKanjiScore,
    parseKanjiStrokes,
    parsePitchReference,
    parsePitchScore,
    parsePracticeStats,
    practiceTone,
    strokeChipsFor,
    totalPracticeCount,
} from "../../src/features/practice/practiceUtils.ts";

/** Lỗi axios giả: chỉ cần hình dạng {isAxiosError, response:{status, data}} như selfCheck.ts đang dùng. */
const axiosErr = (status: number, data: unknown) => ({ isAxiosError: true, response: { status, data } });

export function runPracticeChecks(assert: (cond: boolean, msg: string) => void): void {
    // ---- Đọc lỗi máy chủ (lib/apiErrorInfo)
    const unverified = axiosErr(403, { status: 403, error: "Forbidden", message: "Vui lòng xác thực email trước khi đăng nhập.", code: "EMAIL_NOT_VERIFIED" });
    assert(httpStatusOf(unverified) === 403 && errorCodeOf(unverified) === "EMAIL_NOT_VERIFIED", "Đọc được status + code của body lỗi");
    assert(errorCodeOf(axiosErr(403, '{"code":"EMAIL_NOT_VERIFIED","message":"x"}')) === "EMAIL_NOT_VERIFIED", "Body JSON bị đọc thành chuỗi vẫn lấy được code");
    assert(httpStatusOf(new Error("Network Error")) === null && errorCodeOf(null) === null, "Lỗi không có response -> null");
    assert(errorMessageOf(axiosErr(400, "Email đã được sử dụng!")) === "Email đã được sử dụng!", "Body chuỗi thường là message");
    assert(isEndpointMissing(axiosErr(404, { status: 404, error: "Not Found", message: "No static resource api/practice/stats." })), "404 route chưa có -> đang cập nhật");
    assert(isEndpointMissing(axiosErr(405, { message: "Request method 'POST' is not supported" })), "405 -> đang cập nhật");
    assert(isEndpointMissing(axiosErr(404, "")), "404 body trống -> đang cập nhật");
    assert(!isEndpointMissing(axiosErr(404, { message: "Chưa có nét mẫu cho chữ 書" })), "404 nghiệp vụ có câu riêng -> không phải thiếu route");
    assert(!isEndpointMissing(axiosErr(401, "")) && isEndpointMissing(axiosErr(401, ""), { publicEndpoint: true }), "401 body trống chỉ là 'chưa có' với endpoint công khai");
    assert(!isEndpointMissing(axiosErr(401, { message: "Sai mật khẩu" }), { publicEndpoint: true }), "401 có message vẫn là lỗi thật");
    assert(!isEndpointMissing(axiosErr(500, {})) && !isEndpointMissing(new Error("x")), "500 / lỗi mạng không phải thiếu route");
    assert(SERVER_PENDING_MESSAGE.startsWith("Tính năng đang được cập nhật trên máy chủ"), "Câu thông báo bình tĩnh đúng hợp đồng giao việc");

    // ---- apiErrorText: route chưa có -> đang cập nhật; message server > câu dự phòng theo mã; còn lại null
    const fb = { fallbacks: { 409: "dự phòng 409", 429: "dự phòng 429" } };
    const conflict = (message: string) => axiosErr(409, { status: 409, error: "Conflict", message });
    assert(apiErrorText(conflict("Chỉ sửa được khi lộ trình đang ở bước xem trước."), fb) === "Chỉ sửa được khi lộ trình đang ở bước xem trước.", "apiErrorText: 409 có message -> câu của server, không phải câu dự phòng");
    assert(apiErrorText(axiosErr(409, ""), fb) === "dự phòng 409" && apiErrorText(axiosErr(429, {}), fb) === "dự phòng 429", "apiErrorText: body trống / không có message -> câu dự phòng theo mã");
    assert(apiErrorText(conflict("Conflict"), fb) === "dự phòng 409", "apiErrorText: message = reason phrase ('Conflict') -> coi như không có, dùng câu dự phòng");
    assert(apiErrorText(conflict("Conflict")) === null, "apiErrorText: reason phrase, không có câu dự phòng -> null");
    assert(apiErrorText(axiosErr(409, '{"status":409,"error":"Conflict","message":"Bạn đã báo cáo bộ thẻ này, đang chờ xử lý."}'), fb) === "Bạn đã báo cáo bộ thẻ này, đang chờ xử lý.", "apiErrorText: body JSON bị đọc thành chuỗi vẫn lấy được message");
    assert(apiErrorText(axiosErr(404, { status: 404, error: "Not Found", message: "No static resource api/x." }), fb) === SERVER_PENDING_MESSAGE && apiErrorText(axiosErr(405, ""), fb) === SERVER_PENDING_MESSAGE, "apiErrorText: 404 chung / 405 -> đang cập nhật");
    assert(apiErrorText(axiosErr(404, { message: "Không tìm thấy lượt bóc tách." }), fb) === "Không tìm thấy lượt bóc tách.", "apiErrorText: 404 nghiệp vụ -> câu của server");
    assert(apiErrorText(axiosErr(401, ""), { publicEndpoint: true }) === SERVER_PENDING_MESSAGE && apiErrorText(axiosErr(401, "")) === null, "apiErrorText: 401 body trống chỉ là 'chưa có' với endpoint công khai");
    assert(apiErrorText(axiosErr(500, ""), fb) === null && apiErrorText(new Error("Network Error"), fb) === null && apiErrorText(null) === null, "apiErrorText: mã không có câu dự phòng / lỗi mạng -> null");

    // ---- Đăng ký: chuỗi cũ / JSON mới
    const oldStr = parseRegisterResponse("Đăng ký tài khoản thành công!");
    assert(oldStr.message === "Đăng ký tài khoản thành công!" && !oldStr.needsVerification, "Backend cũ trả chuỗi -> không cần xác thực");
    const newJson = parseRegisterResponse({ message: "Đã gửi email kích hoạt", needsVerification: true });
    assert(newJson.message === "Đã gửi email kích hoạt" && newJson.needsVerification, "Backend mới trả JSON + needsVerification");
    assert(parseRegisterResponse('{"message":"ok","needsVerification":true}').needsVerification, "JSON dạng chuỗi vẫn đọc được cờ");
    assert(!parseRegisterResponse({ message: "ok", needsVerification: "true" }).needsVerification, "Cờ phải là boolean true");
    assert(parseRegisterResponse("").message === REGISTER_DEFAULT_MESSAGE && parseRegisterResponse(null).message === REGISTER_DEFAULT_MESSAGE, "Rỗng -> câu mặc định");
    assert(parseRegisterResponse({ needsVerification: false }).message === REGISTER_DEFAULT_MESSAGE, "Thiếu message -> câu mặc định");

    // ---- Loại lỗi đăng nhập
    assert(loginErrorKind(unverified) === "email-not-verified", "403 EMAIL_NOT_VERIFIED -> nút gửi lại email");
    assert(loginErrorKind(axiosErr(403, { message: "Tài khoản đã bị khoá, vui lòng liên hệ hỗ trợ." })) === "locked", "403 'bị khoá' -> nút khiếu nại");
    assert(loginErrorKind(axiosErr(403, { message: "Tài khoản đã bị khóa: spam" })) === "locked", "Nhận cả cách viết 'khóa'");
    assert(loginErrorKind(axiosErr(403, { message: "Tài khoản đã bị khoá".normalize("NFD") })) === "locked", "Chuỗi NFD vẫn nhận ra khoá");
    assert(loginErrorKind(axiosErr(401, { message: "Email hoặc mật khẩu không đúng!" })) === null, "Sai mật khẩu -> không có nút phụ");
    assert(loginErrorKind(axiosErr(403, { message: "Hệ thống tạm ngừng đăng ký tài khoản mới." })) === null, "403 khác -> không có nút phụ");
    assert(loginErrorKind(axiosErr(429, { message: "Bạn đã đăng nhập sai quá nhiều lần." })) === null, "429 -> không có nút phụ");
    assert(loginErrorKind(axiosErr(403, { message: "x", code: "ACCOUNT_LOCKED" })) === "locked", "Code ACCOUNT_LOCKED (nếu backend thêm) -> khoá");

    // ---- Khiếu nại
    const okAppeal = validateAppeal(" user@example.com ", "Tôi bị khoá nhầm, xin xem lại.");
    assert(!okAppeal.email && !okAppeal.message, "Khiếu nại hợp lệ không có lỗi");
    assert(!!validateAppeal("", "x".repeat(20)).email && !!validateAppeal("abc", "x".repeat(20)).email, "Email trống / sai định dạng bị chặn");
    assert(!!validateAppeal("a@b.co", "  " + "x".repeat(APPEAL_MIN - 1) + "  ").message, "Dưới 10 ký tự (sau khi bỏ khoảng trắng) bị chặn");
    assert(!validateAppeal("a@b.co", "x".repeat(APPEAL_MIN)).message && !validateAppeal("a@b.co", "x".repeat(APPEAL_MAX)).message, "Đúng 10 / 1000 ký tự hợp lệ");
    assert(!!validateAppeal("a@b.co", "x".repeat(APPEAL_MAX + 1)).message, "Quá 1000 ký tự bị chặn");
    assert(cooldownSecondsLeft(10_500, 10_000) === 1 && cooldownSecondsLeft(10_000, 10_000) === 0 && cooldownSecondsLeft(0, 5) === 0, "Đếm ngược gửi lại làm tròn lên, không âm");

    // ---- Nét mẫu
    const strokes = parseKanjiStrokes({ kanji: "十", strokeCount: 2, strokes: [[[0.1, 0.5], [0.9, 0.5]], [[0.5, 0.1], [0.5, 0.9]]] });
    assert(strokes !== null && strokes.strokeCount === 2 && strokes.strokes[1][1][1] === 0.9, "Đọc nét mẫu KanjiVG");
    assert(parseKanjiStrokes({ strokes: [] }) === null && parseKanjiStrokes(null) === null, "Không có nét -> null (chưa có nét mẫu)");
    const messy = parseKanjiStrokes({ strokeCount: 5, strokes: [[[0, 0], ["x", 1], { x: 1, y: 1 }], [], "hỏng"] }, "一");
    assert(messy !== null && messy.strokes.length === 1 && messy.strokes[0].length === 2 && messy.strokeCount === 1 && messy.kanji === "一", "Bỏ điểm / nét hỏng, số nét theo dữ liệu thật");

    // ---- Kết quả chấm nét -> StrokeScore + chip
    const scored = mapKanjiScore(
        {
            kanji: "十",
            totalScore: 72.4,
            isCorrectOrder: false,
            feedback: " Nét 2 vẽ ngược hướng. ",
            perStroke: [
                { index: 1, score: 40, wrongDirection: true, expectedIndex: 1 },
                { index: 0, score: 95, wrongDirection: false, expectedIndex: 0 },
                { index: 2, score: 10, wrongDirection: false, expectedIndex: 2 },
            ],
            missing: [3],
            extra: [2],
            strokeCount: 4,
        },
        "十"
    );
    assert(scored !== null && scored.totalScore === 72.4 && !scored.isCorrectOrder && scored.feedback === "Nét 2 vẽ ngược hướng.", "Ánh xạ điểm tổng / thứ tự / nhận xét");
    assert(scored !== null && scored.perStroke.map((p) => p.index).join() === "0,1,2", "perStroke sắp theo thứ tự nét vẽ");
    assert(scored !== null && scored.perStroke[2].expectedIndex === null, "Nét trong extra luôn là nét thừa (expectedIndex null)");
    const chips = scored ? strokeChipsFor(scored, 4) : [];
    assert(chips.map((c) => `${c.strokeNo}:${c.status}`).join() === "1:correct,2:wrong-direction,3:extra,4:missing", "Chip: đúng, sai hướng, thừa, thiếu theo missing của máy chủ");
    const noMissing = mapKanjiScore({ totalScore: 100, isCorrectOrder: true, perStroke: [{ index: 0, score: 90, expectedIndex: 0 }] });
    assert(noMissing !== null && noMissing.missing === null && strokeChipsFor(noMissing, 2).map((c) => c.status).join() === "correct,missing", "Thiếu mảng missing -> suy nét thiếu từ số nét chuẩn như trước");
    assert(strokeChipsFor({ totalScore: 50, isCorrectOrder: true, feedback: "", perStroke: [] }, 1)[0].status === "missing", "StrokeScore của scorer tự tiêm vẫn dùng đường cũ");
    assert(mapKanjiScore({ feedback: "lỗi" }) === null && mapKanjiScore("x") === null, "Thiếu totalScore -> null");
    const clamped = mapKanjiScore({ totalScore: 140, perStroke: [{ score: -5 }, { index: 1, expectedIndex: null, score: 70 }] });
    assert(clamped !== null && clamped.totalScore === 100 && clamped.perStroke[0].score === 0 && clamped.perStroke[0].index === 0 && clamped.perStroke[1].expectedIndex === null, "Kẹp điểm 0..100, index thiếu lấy theo vị trí, expectedIndex null giữ nguyên");

    // ---- Trọng âm
    const ref = parsePitchReference({ word: "雨", reading: "あめ", accentType: 1, moras: [{ mora: "あ", level: "H" }, { mora: "め", level: "L" }, { mora: "x", level: "?" }] });
    assert(ref !== null && ref.accentType === 1 && ref.moras.length === 2, "Đọc mẫu trọng âm, bỏ mora hỏng");
    assert(parsePitchReference({ word: "雨" }) === null && parsePitchReference({ accentType: -1 }) === null, "Thiếu / sai accentType -> null");
    const ps = parsePitchScore({ pct: 66.6, userHL: ["L", null, "H"], refHL: "LHH", wrongMora: [1, 1, 0], voicedRatio: 1.4, feedback: "ok" });
    assert(ps !== null && ps.pct === 67 && ps.userHL.join() === "L,,H" && ps.refHL.join("") === "LHH" && ps.wrongMora.join() === "0,1" && ps.voicedRatio === 1, "Đọc điểm trọng âm máy chủ (mảng / chuỗi H-L, bỏ trùng, kẹp)");
    assert(parsePitchScore({ userHL: [] }) === null, "Thiếu pct -> giữ điểm trình duyệt");

    const contour = Array.from({ length: 5000 }, (_, i) => ({ t: i * 0.01, f0: i % 2 ? 180.123 : null }));
    const small = downsampleContour(contour);
    assert(small.length === MAX_CONTOUR_POINTS && small[0].t === 0 && small[small.length - 1].t === 49.99, "Rút contour về ≤ 2000 điểm, giữ đầu / cuối");
    const tiny = downsampleContour([{ t: 0.12345, f0: Number.NaN }, { t: 1, f0: 200.06 }]);
    assert(tiny.length === 2 && tiny[0].t === 0.123 && tiny[0].f0 === null && tiny[1].f0 === 200.1, "Contour ngắn giữ nguyên, làm tròn, NaN -> null");
    assert(downsampleContour([]).length === 0, "Contour rỗng -> []");
    assert(clipText("  あいうえお  ", 3) === "あいう" && clipText("𠮟る", 1) === "𠮟", "Cắt chuỗi theo code point");

    // ---- Thống kê
    const stats = parsePracticeStats({
        write: { count: 3, avg: 78.25 },
        speak: { count: 0, avg: 50 },
        recent: [
            { kind: "write", target: "書", score: 80, createdAt: "2026-10-18T10:00:00Z" },
            { kind: "pitch", target: "あめ", score: 101, createdAt: "2026-10-19T10:00:00Z" },
            { kind: "dance", target: "x", score: 1, createdAt: "2026-10-19T11:00:00Z" },
            { kind: "speak", target: "x", createdAt: "2026-10-19T11:00:00Z" },
        ],
    });
    assert(stats.write.count === 3 && stats.speak.avg === null && stats.pitch.count === 0 && stats.pitch.avg === null, "Loại thiếu / 0 lượt -> TB null");
    assert(stats.recent.length === 2 && stats.recent[0].kind === "pitch" && stats.recent[0].score === 100, "Lượt gần đây: bỏ hỏng, mới nhất trước, kẹp điểm");
    assert(totalPracticeCount(stats) === 3 && totalPracticeCount(parsePracticeStats(null)) === 0, "Tổng lượt; null -> 0");
    assert(formatPracticeAvg(null) === "—" && formatPracticeAvg(78.25) === "78,3" && formatPracticeAvg(80) === "80", "TB kiểu Việt, 1 chữ số thập phân");
    assert(practiceTone(80) === "good" && practiceTone(79.9) === "ok" && practiceTone(60) === "ok" && practiceTone(59) === "poor", "Thang màu ≥80 / ≥60");
}
