// Smoke test Admin Panel (G0 của docs/Plan/plans/2026-10-18-admin-roadmap.md): đi qua mọi endpoint /api/admin/**.
// Chạy trên DB cô lập: BASE_URL=http://localhost:8082/api node smoke-admin.mjs (backend profile e2e, có seed V15).
// Mỗi section độc lập: 1 section đỏ không chặn section sau.
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:8082/api";
const pw = "Secret123!";

async function api(token, method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, text };
}
async function login(email, password) {
    const r = await api(null, "POST", "/auth/login", { email, password });
    assert.equal(r.status, 200, `login ${email}: ${r.status} ${r.text}`);
    return r.data.accessToken;
}
async function signUp(tag) {
    const email = `adm-${tag}-${Date.now()}@test.com`;
    let r = await api(null, "POST", "/auth/register", { email, password: pw, fullName: `User ${tag}` });
    assert.equal(r.status, 200, `register: ${r.status} ${r.text}`);
    const token = await login(email, pw);
    r = await api(token, "GET", "/auth/me");
    return { email, token, id: r.data.id };
}

const results = [];
async function section(name, fn) {
    try { await fn(); results.push(`PASS ${name}`); }
    catch (e) { results.push(`FAIL ${name}: ${String(e.message).slice(0, 300)} | actual=${JSON.stringify(e.actual)} expected=${JSON.stringify(e.expected)} | ${String(e.stack).slice(0, 600)}`); }
}

/** Seed V15/V16: mật khẩu mặc định + phải đổi trước khi vào /api/admin. Idempotent giữa các lần chạy. */
async function staffLogin(email, seedPassword) {
    const newPassword = seedPassword + "-Smoke1";
    let r = await api(null, "POST", "/auth/login", { email, password: seedPassword });
    let password = seedPassword;
    if (r.status === 401) { r = await api(null, "POST", "/auth/login", { email, password: newPassword }); password = newPassword; }
    assert.equal(r.status, 200, `login ${email}: ${r.status} ${r.text}`);
    let token = r.data.accessToken;
    if (r.data.mustChangePassword) {
        assert.equal((await api(token, "GET", "/admin/stats")).status, 403, "staff chưa đổi mật khẩu seed phải bị 403 admin");
        r = await api(token, "PUT", "/auth/password", { currentPassword: password, newPassword });
        assert.equal(r.status, 200, `đổi mật khẩu seed: ${r.status} ${r.text}`);
        assert.equal(r.data.mustChangePassword, false);
        token = r.data.accessToken;
    }
    assert.equal((await api(token, "GET", "/auth/me")).status, 200);
    return token;
}

const s = {};
s.superToken = await staffLogin("superadmin@nihongen.local", "superadmin");
s.adminToken = await staffLogin("admin1@nihongen.local", "admin1");
s.alice = await signUp("alice");
s.bob = await signUp("bob");
{   // Alice: bộ thẻ public; Bob: đánh giá + báo cáo
    let r = await api(s.alice.token, "POST", "/decks", { title: `Bộ thẻ smoke admin ${Date.now()}`, level: "N5", visibility: "public",
        cards: [{ term: "犬", meaning: "chó" }] });
    assert.equal(r.status, 201, `tạo deck: ${r.status} ${r.text}`);
    s.deck = r.data;
    r = await api(s.bob.token, "PUT", `/library/decks/${s.deck.id}/rating`, { stars: 1, comment: "bình luận xấu" });
    assert.equal(r.status, 200, `rating: ${r.status} ${r.text}`);
    r = await api(s.bob.token, "POST", `/library/decks/${s.deck.id}/reports`, { reason: "OFFENSIVE", detail: "thử" });
    assert.ok([200, 201].includes(r.status), `report: ${r.status} ${r.text}`);
}

await section("phân quyền: USER bị 403 admin, staff bị 403 API học", async () => {
    assert.equal((await api(s.alice.token, "GET", "/admin/stats")).status, 403);
    assert.equal((await api(null, "GET", "/admin/stats")).status, 401);
    assert.equal((await api(s.adminToken, "GET", "/decks")).status, 403, "staff gọi API học phải 403");
    assert.equal((await api(s.adminToken, "GET", "/auth/me")).status, 200, "staff vẫn xem được hồ sơ");
});

await section("dashboard: stats + health", async () => {
    let r = await api(s.adminToken, "GET", "/admin/stats");
    assert.equal(r.status, 200, r.text);
    assert.ok(r.data.users.total >= 4 && r.data.decks.public >= 1 && r.data.openReports >= 1, JSON.stringify(r.data).slice(0, 300));
    assert.equal(r.data.series.length, 30, "chuỗi 30 ngày");
    r = await api(s.adminToken, "GET", "/admin/health");
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.db, "ok", r.text);
    assert.ok(["ok", "stale", "missing", "unmonitored"].includes(r.data.backup), `backup: ${r.text}`);
});

await section("người dùng: list / detail / khoá / premium / hạn mức / thu hồi phiên", async () => {
    let r = await api(s.adminToken, "GET", `/admin/users?q=${encodeURIComponent(s.alice.email)}`);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.items.length, 1, "tìm theo email");
    r = await api(s.adminToken, "GET", `/admin/users?q=${encodeURIComponent("%")}`);
    assert.equal(r.status, 200, "ký tự % phải được escape, không lỗi 500");
    r = await api(s.adminToken, "GET", `/admin/users/${s.alice.id}`);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.deckCount, 1);
    // khoá -> login 403, token cũ bị từ chối; mở khoá -> login lại được
    r = await api(s.adminToken, "PATCH", `/admin/users/${s.alice.id}`, { locked: true, lockedReason: "Spam bình luận" });
    assert.equal(r.status, 200, r.text);
    assert.ok(r.data.lockedAt, "lockedAt phải có");
    assert.equal(r.data.lockedReason, "Spam bình luận");
    assert.equal((await api(s.alice.token, "GET", "/decks")).status, 401, "token cũ sau khi khoá phải 401");
    r = await api(null, "POST", "/auth/login", { email: s.alice.email, password: pw });
    assert.equal(r.status, 403, `login khi bị khoá phải 403, nhận ${r.status}`);
    assert.ok(r.text.includes("Spam bình luận"), `403 phải kèm lý do: ${r.text}`);
    r = await api(s.adminToken, "PATCH", `/admin/users/${s.alice.id}`, { locked: false });
    assert.equal(r.data.lockedAt, null);
    assert.equal(r.data.lockedReason, null);
    s.alice.token = await login(s.alice.email, pw);
    // premium + hạn mức riêng
    r = await api(s.adminToken, "PATCH", `/admin/users/${s.alice.id}`, { premium: true, extractionDailyLimit: 7 });
    assert.equal(r.data.isPremium, true); assert.equal(r.data.extractionDailyLimit, 7);
    const until = new Date(Date.now() + 86400e3).toISOString().replace(/\.\d{3}Z$/, "Z");
    r = await api(s.adminToken, "PATCH", `/admin/users/${s.alice.id}`, { premium: true, premiumUntil: until });
    assert.equal(r.data.premiumUntil, until, r.text);
    r = await api(s.alice.token, "GET", "/auth/me");
    assert.equal(r.data.premiumUntil, until, "người học thấy hạn Premium");
    r = await api(s.adminToken, "PATCH", `/admin/users/${s.alice.id}`, { clearLimit: true });
    assert.equal(r.data.extractionDailyLimit, null);
    assert.equal((await api(s.adminToken, "PATCH", `/admin/users/${s.alice.id}`, { extractionDailyLimit: 5000 })).status, 400);
    // thu hồi phiên
    assert.equal((await api(s.adminToken, "POST", `/admin/users/${s.alice.id}/revoke-sessions`)).status, 204);
    assert.equal((await api(s.alice.token, "GET", "/decks")).status, 401, "token cũ sau revoke phải 401");
    s.alice.token = await login(s.alice.email, pw);
});

await section("vai trò: chỉ SUPER_ADMIN; không tự đổi; ADMIN không khoá được SUPER_ADMIN", async () => {
    assert.equal((await api(s.adminToken, "PUT", `/admin/users/${s.bob.id}/role`, { role: "ADMIN" })).status, 403);
    let r = await api(s.superToken, "PUT", `/admin/users/${s.bob.id}/role`, { role: "ADMIN" });
    assert.equal(r.status, 200, r.text); assert.equal(r.data.role, "ADMIN");
    assert.equal((await api(s.bob.token, "GET", "/decks")).status, 403, "Bob thành staff -> mất API học ngay");
    assert.equal((await api(s.bob.token, "GET", "/admin/stats")).status, 200, "Bob thành staff -> vào admin ngay");
    r = await api(s.superToken, "PUT", `/admin/users/${s.bob.id}/role`, { role: "USER" });
    assert.equal(r.data.role, "USER");
    const me = (await api(s.superToken, "GET", "/auth/me")).data;
    r = await api(s.superToken, "PUT", `/admin/users/${me.id}/role`, { role: "USER" });
    assert.ok(r.status >= 400 && r.status < 500, `tự đổi vai trò phải bị chặn, nhận ${r.status}`);
    r = await api(s.adminToken, "PATCH", `/admin/users/${me.id}`, { locked: true });
    assert.ok(r.status >= 400 && r.status < 500, `ADMIN khoá SUPER_ADMIN phải bị chặn, nhận ${r.status}`);
});

await section("nội dung: decks / flags / ratings / extractions", async () => {
    let r = await api(s.adminToken, "GET", `/admin/decks?q=${encodeURIComponent(s.deck.title)}&visibility=public`);
    assert.equal(r.status, 200, r.text); assert.equal(r.data.items.length, 1);
    r = await api(s.adminToken, "GET", `/admin/decks/${s.deck.id}`);
    assert.equal(r.status, 200, r.text);
    assert.ok(Array.isArray(r.data.cards) && r.data.cards.length === 1, "bộ public phải xem được thẻ");
    r = await api(s.adminToken, "PATCH", `/admin/decks/${s.deck.id}/flags`, { featured: true });
    assert.equal(r.status, 200, r.text); assert.equal(r.data.isFeatured ?? r.data.featured, true);
    r = await api(s.adminToken, "PATCH", `/admin/decks/${s.deck.id}/flags`, { featured: false });
    assert.equal(r.status, 200, r.text);
    r = await api(s.adminToken, "GET", `/admin/ratings?deckId=${s.deck.id}`);
    assert.equal(r.status, 200, r.text); assert.equal(r.data.items.length, 1);
    s.ratingId = r.data.items[0].id;
    assert.equal((await api(s.adminToken, "DELETE", `/admin/ratings/${s.ratingId}/comment`)).status, 204);
    r = await api(s.adminToken, "GET", `/admin/ratings?deckId=${s.deck.id}`);
    assert.ok(r.data.items.length === 0 || r.data.items[0].comment == null, "bình luận phải bị xoá (danh sách chỉ gồm đánh giá có bình luận)");
    r = await api(s.bob.token, "GET", `/library/decks/${s.deck.id}/ratings`);
    assert.equal(r.status, 200, r.text);
    r = await api(s.adminToken, "GET", "/admin/extractions?status=DONE");
    assert.equal(r.status, 200, r.text);
    assert.equal((await api(s.adminToken, "GET", "/admin/extractions?status=XXX")).status, 400);
});

await section("báo cáo: list / resolve UNPUBLISH / báo cáo lại / dismiss", async () => {
    let r = await api(s.adminToken, "GET", `/admin/reports?status=OPEN&deckId=${s.deck.id}`);
    assert.equal(r.status, 200, r.text); assert.equal(r.data.items.length, 1);
    const id = r.data.items[0].id;
    r = await api(s.adminToken, "POST", `/admin/reports/${id}/resolve`, { action: "UNPUBLISH_DECK", note: "gỡ" });
    assert.equal(r.status, 200, r.text); assert.equal(r.data.status, "RESOLVED");
    r = await api(s.adminToken, "GET", `/admin/decks/${s.deck.id}`);
    assert.equal(r.data.visibility, "private", "resolve UNPUBLISH phải chuyển private");
    assert.ok(r.status >= 400 || !r.data.cards, "bộ private hết báo cáo OPEN -> không xem thẻ");
    r = await api(s.adminToken, "POST", `/admin/reports/${id}/resolve`, { action: "NONE" });
    assert.ok(r.status >= 400, "resolve lần 2 phải bị chặn");
    // Alice public lại, Bob báo cáo lại -> dismiss
    r = await api(s.alice.token, "PUT", `/decks/${s.deck.id}`, { title: s.deck.title, level: "N5", visibility: "public" });
    assert.equal(r.status, 200, r.text);
    r = await api(s.bob.token, "POST", `/library/decks/${s.deck.id}/reports`, { reason: "SPAM" });
    assert.ok([200, 201].includes(r.status), `report lại: ${r.status} ${r.text}`);
    r = await api(s.bob.token, "POST", `/library/decks/${s.deck.id}/reports`, { reason: "SPAM" });
    assert.equal(r.status, 409, `báo cáo trùng khi còn OPEN phải 409, nhận ${r.status}`);
    r = await api(s.adminToken, "GET", `/admin/reports?status=OPEN&deckId=${s.deck.id}`);
    const id2 = r.data.items[0].id;
    r = await api(s.adminToken, "POST", `/admin/reports/${id2}/dismiss`, { note: "không vi phạm" });
    assert.equal(r.status, 200, r.text); assert.equal(r.data.status, "DISMISSED");
    r = await api(s.adminToken, "GET", `/admin/reports?status=DISMISSED&deckId=${s.deck.id}`);
    assert.equal(r.data.items.length, 1);
});

await section("cấu hình: SUPER_ADMIN sửa, announcement + registration_open có hiệu lực", async () => {
    let r = await api(s.adminToken, "GET", "/admin/settings");
    assert.equal(r.status, 200, r.text);
    const orig = r.data;
    assert.equal((await api(s.adminToken, "PUT", "/admin/settings", orig)).status, 403, "ADMIN sửa phải 403");
    try {
    r = await api(s.superToken, "PUT", "/admin/settings", { ...orig, announcement: "Bảo trì 22h", registration_open: false });
    assert.equal(r.status, 200, r.text);
    r = await api(s.alice.token, "GET", "/announcement");
    assert.equal(r.data.text, "Bảo trì 22h", r.text);
    r = await api(null, "POST", "/auth/register", { email: `closed-${Date.now()}@test.com`, password: pw, fullName: "X" });
    assert.equal(r.status, 403, `đóng đăng ký phải 403, nhận ${r.status}`);
    assert.equal((await api(s.superToken, "PUT", "/admin/settings", { ...orig, extraction_daily_limit_free: 9999 })).status, 400);
    } finally {
        r = await api(s.superToken, "PUT", "/admin/settings", { ...orig, announcement: "", registration_open: true });
        assert.equal(r.status, 200, r.text);
    }
});

await section("audit: có bản ghi, lọc theo actor", async () => {
    let r = await api(s.adminToken, "GET", "/admin/audit-logs");
    assert.equal(r.status, 200, r.text);
    const actions = new Set(r.data.items.map((a) => a.action));
    for (const a of ["USER_LOCK", "USER_ROLE", "REPORT_RESOLVE", "SETTINGS_UPDATE"]) {
        assert.ok([...actions].some((x) => x.startsWith(a.split("_")[0])), `thiếu nhóm hành động ${a} trong ${[...actions]}`);
    }
    const superId = (await api(s.superToken, "GET", "/auth/me")).data.id;
    r = await api(s.adminToken, "GET", `/admin/audit-logs?actorId=${superId}`);
    assert.equal(r.status, 200, r.text);
    assert.ok(r.data.items.every((a) => a.actorEmail === "superadmin@nihongen.local"), "lọc actor");
});

await section("xoá bộ thẻ bởi admin", async () => {
    assert.equal((await api(s.adminToken, "DELETE", `/admin/decks/${s.deck.id}`)).status, 204);
    assert.equal((await api(s.alice.token, "GET", `/decks/${s.deck.id}`)).status, 404);
    assert.equal((await api(s.adminToken, "DELETE", `/admin/decks/${s.deck.id}`)).status, 404);
});

await section("thông báo trong app: Bob (báo cáo) và Alice (chủ bộ, Premium) nhận đúng loại", async () => {
    let r = await api(s.bob.token, "GET", "/notifications");
    assert.equal(r.status, 200, r.text);
    const bobTypes = r.data.items.map((n) => n.type);
    assert.ok(bobTypes.includes("REPORT_RESOLVED"), `Bob phải có REPORT_RESOLVED: ${bobTypes}`);
    assert.ok(bobTypes.includes("ROLE_CHANGED"), `Bob phải có ROLE_CHANGED: ${bobTypes}`);
    r = await api(s.alice.token, "GET", "/notifications");
    const aliceTypes = r.data.items.map((n) => n.type);
    for (const t of ["DECK_UNPUBLISHED", "PREMIUM_CHANGED", "DECK_DELETED"]) assert.ok(aliceTypes.includes(t), `Alice thiếu ${t}: ${aliceTypes}`);
    assert.ok(r.data.unread > 0);
    const first = r.data.items[0].id;
    assert.equal((await api(s.bob.token, "POST", `/notifications/${first}/read`)).status, 404, "người khác không đánh dấu được");
    assert.equal((await api(s.alice.token, "POST", `/notifications/${first}/read`)).status, 204);
    r = await api(s.alice.token, "POST", "/notifications/read-all");
    assert.equal(r.status, 200, r.text);
    assert.equal((await api(s.alice.token, "GET", "/notifications")).data.unread, 0);
    assert.equal((await api(s.adminToken, "GET", "/notifications")).status, 200, "staff cũng gọi được");
});

// ---- B7 (kế hoạch 26/10): mẹo nhớ (§4), ngân hàng câu hỏi (G3), nguồn tri thức (§5), khiếu nại (§6), từ điển (A9)

await section("mẹo nhớ: người học gửi -> PENDING trong hàng chờ, admin duyệt -> thành mẹo công khai", async () => {
    let r = await api(s.alice.token, "POST", "/kanji/mnemonics", { kanji: "犬", mnemonicVi: `Con chó nhớ bộ khuyển (smoke ${Date.now()})` });
    assert.ok([200, 201].includes(r.status), `gửi mẹo: ${r.status} ${r.text}`);
    const mid = r.data.id;
    r = await api(s.adminToken, "GET", "/admin/mnemonics?status=PENDING&size=100");
    assert.equal(r.status, 200, r.text);
    assert.ok(r.data.items.some((m) => m.id === mid), "mẹo vừa gửi nằm trong hàng chờ");
    r = await api(s.adminToken, "POST", `/admin/mnemonics/${mid}/approve`, { note: "smoke" });
    assert.equal(r.status, 200, `duyệt: ${r.status} ${r.text}`);
    r = await api(s.alice.token, "GET", "/kanji/%E7%8A%AC/mnemonics");
    assert.equal(r.status, 200, r.text);
    assert.ok(r.data.approved && r.data.approved.id === mid, "mẹo được duyệt thành mẹo công khai của chữ");
    r = await api(s.adminToken, "GET", "/admin/audit-logs?targetType=MNEMONIC&size=50");
    assert.equal(r.status, 200, r.text);
});

await section("ngân hàng câu hỏi: danh sách + lọc; tham số sai -> 400", async () => {
    let r = await api(s.adminToken, "GET", "/admin/questions?size=5");
    assert.equal(r.status, 200, r.text);
    assert.ok(Array.isArray(r.data.items), "items phải là mảng");
    r = await api(s.adminToken, "GET", "/admin/questions?flagged=true&size=5");
    assert.equal(r.status, 200, r.text);
    assert.equal((await api(s.adminToken, "GET", "/admin/questions?kind=XXX")).status, 400);
    assert.equal((await api(s.alice.token, "GET", "/admin/questions")).status, 403);
});

await section("nguồn tri thức chuẩn: tải văn bản -> list -> chi tiết -> lưu trữ -> xoá", async () => {
    const form = new FormData();
    form.append("text", "学校\tがっこう\ttrường học\n勉強\tべんきょう\thọc");
    form.append("title", `Nguồn smoke ${Date.now()}`);
    form.append("kind", "VOCAB");
    form.append("level", "N5");
    const res = await fetch(`${BASE}/admin/knowledge-sources`, { method: "POST", headers: { Authorization: `Bearer ${s.adminToken}` }, body: form });
    const body = await res.text();
    assert.ok([200, 201].includes(res.status), `tải nguồn: ${res.status} ${body}`);
    const src = JSON.parse(body);
    assert.ok(src.id, "thiếu id nguồn");
    let r = await api(s.adminToken, "GET", "/admin/knowledge-sources?status=ACTIVE&size=100");
    assert.equal(r.status, 200, r.text);
    assert.ok(r.data.items.some((i) => i.id === src.id), "nguồn vừa tải có trong danh sách ACTIVE");
    r = await api(s.adminToken, "GET", `/admin/knowledge-sources/${src.id}`);
    assert.equal(r.status, 200, r.text);
    assert.ok((r.data.entryCount ?? r.data.entries?.length ?? 0) >= 2, `nguồn phải có ≥ 2 mục: ${r.text.slice(0, 200)}`);
    r = await api(s.adminToken, "POST", `/admin/knowledge-sources/${src.id}/archive`);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.status, "ARCHIVED");
    assert.equal((await api(s.adminToken, "DELETE", `/admin/knowledge-sources/${src.id}`)).status, 403, "xoá nguồn chỉ SUPER_ADMIN");
    assert.equal((await api(s.superToken, "DELETE", `/admin/knowledge-sources/${src.id}`)).status, 204);
    assert.equal((await api(s.superToken, "GET", `/admin/knowledge-sources/${src.id}`)).status, 404);
});

await section("khiếu nại: tài khoản bị khoá gửi khiếu nại -> admin thấy OPEN -> giải quyết UNLOCK -> đăng nhập lại được", async () => {
    const carol = await signUp("carol");
    let r = await api(s.adminToken, "PATCH", `/admin/users/${carol.id}`, { locked: true, lockedReason: "smoke: thử khiếu nại" });
    assert.equal(r.status, 200, `khoá: ${r.status} ${r.text}`);
    assert.equal((await api(null, "POST", "/auth/login", { email: carol.email, password: pw })).status, 403, "bị khoá -> 403 khi đăng nhập");
    r = await api(null, "POST", "/auth/appeals", { email: carol.email, message: "Tôi bị khoá nhầm, mong được xem xét (smoke)." });
    assert.ok([200, 201, 202].includes(r.status), `gửi khiếu nại: ${r.status} ${r.text}`);
    r = await api(s.adminToken, "GET", "/admin/appeals?status=OPEN&size=100");
    assert.equal(r.status, 200, r.text);
    const ap = r.data.items.find((a) => a.email === carol.email || a.userId === carol.id);
    assert.ok(ap, `không thấy khiếu nại của ${carol.email}`);
    r = await api(s.adminToken, "POST", `/admin/appeals/${ap.id}/resolve`, { action: "UNLOCK", note: "smoke" });
    assert.equal(r.status, 200, `giải quyết: ${r.status} ${r.text}`);
    assert.equal((await api(null, "POST", "/auth/login", { email: carol.email, password: pw })).status, 200, "mở khoá qua khiếu nại");
});

await section("từ điển admin: thống kê / hàng chờ / tìm (tìm cần ai-service: 503 khi tắt)", async () => {
    let r = await api(s.adminToken, "GET", "/admin/dictionary/stats");
    assert.equal(r.status, 200, r.text);
    r = await api(s.adminToken, "GET", "/admin/dictionary/queue?page=0&size=5");
    assert.equal(r.status, 200, r.text);
    assert.ok(Array.isArray(r.data.items), "hàng chờ phải có items");
    r = await api(s.adminToken, "GET", "/admin/dictionary/search?q=%E9%A3%9F%E3%81%B9%E3%82%8B&mode=ja");
    assert.ok([200, 503].includes(r.status), `tìm: ${r.status} ${r.text}`);
    assert.equal((await api(s.alice.token, "GET", "/admin/dictionary/stats")).status, 403);
});

await section("dịch câu (V39, D33): POST /dictionary/translate 200 có state + tokens (ai-service tắt -> 503), 400 rỗng / hướng lạ / quá dài, khoá cấu hình", async () => {
    let r = await api(s.alice.token, "POST", "/dictionary/translate", { text: "ご飯を食べました。" });
    assert.ok([200, 503].includes(r.status), `dịch: ${r.status} ${r.text}`);
    if (r.status === 200) {
        assert.ok(["OK", "OFF", "LIMIT", "AI_DOWN"].includes(r.data.state), `state = ${r.data.state}`);
        assert.equal(r.data.direction, "ja-vi", "có chữ Nhật -> ja-vi");
        assert.ok(Array.isArray(r.data.tokens) && r.data.tokens.length > 0, "phân tích câu luôn có (kể cả khi không dịch được)");
        assert.ok(typeof r.data.aiLeft === "number" && typeof r.data.aiLimit === "number", "aiLeft / aiLimit");
        assert.equal(typeof r.data.cached, "boolean");
        assert.equal(r.data.reason, undefined, "reason không lộ ra client");
        if (r.data.state !== "OK") assert.equal(r.data.translation, null, "không có bản dịch thì không bịa câu");
    }
    r = await api(s.alice.token, "POST", "/dictionary/translate", { text: "Tôi ăn cơm.", direction: "vi-ja" });
    assert.ok([200, 503].includes(r.status), `dịch vi-ja: ${r.status} ${r.text}`);
    if (r.status === 200) assert.equal(r.data.direction, "vi-ja");
    assert.equal((await api(s.alice.token, "POST", "/dictionary/translate", { text: "   " })).status, 400, "văn bản rỗng -> 400");
    assert.equal((await api(s.alice.token, "POST", "/dictionary/translate", { text: "x", direction: "en-vi" })).status, 400, "hướng lạ -> 400");
    assert.equal((await api(s.alice.token, "POST", "/dictionary/translate", { text: "x".repeat(1001) })).status, 400, "quá 1 000 ký tự -> 400");
    // V40: báo bản dịch sai chỉ cho câu đã nằm trong bộ nhớ dịch; thiếu đề xuất lẫn ghi chú -> 400
    r = await api(s.alice.token, "POST", "/dictionary/translate/reports", { text: `smoke ${Date.now()} 学校`, direction: "ja-vi", note: "sai" });
    assert.equal(r.status, 404, `báo câu chưa dịch: ${r.status} ${r.text}`);
    r = await api(s.alice.token, "POST", "/dictionary/translate/reports", { text: "ご飯を食べました。", direction: "ja-vi" });
    assert.equal(r.status, 400, `báo thiếu nội dung: ${r.status} ${r.text}`);
    r = await api(s.adminToken, "GET", "/admin/settings");
    assert.equal(r.status, 200, r.text);
    assert.equal(typeof r.data.dictionary_translate_hourly_limit, "number", "khoá cấu hình dictionary_translate_hourly_limit");
});

await section("kiểm duyệt AI (V38): hàng chờ / counts / bình luận -> trạng thái / quét lại / công tắc nhạy cảm / badge (ai-service tắt -> PENDING)", async () => {
    let r = await api(s.adminToken, "GET", "/admin/moderation?status=OPEN&size=5");
    assert.equal(r.status, 200, `hàng chờ: ${r.status} ${r.text}`);
    assert.ok(Array.isArray(r.data.items), "hàng chờ phải có items");
    r = await api(s.adminToken, "GET", "/admin/moderation/counts");
    assert.equal(r.status, 200, r.text);
    assert.ok(typeof r.data.open === "number" && typeof r.data.pending === "number", "counts {open, flagged, blocked, pending}");
    // bình luận ở mục chữ Hán (không cần JMdict): ai-service tắt -> PENDING, bật -> CLEAN / FLAGGED / BLOCKED
    r = await api(s.alice.token, "POST", "/dictionary/entries/k:%E9%A3%9F/comments", { content: "Chữ này nghĩa là ăn, dễ nhớ" });
    assert.equal(r.status, 201, `bình luận: ${r.status} ${r.text}`);
    const st = r.data.moderation?.status ?? "CLEAN";
    assert.ok(["PENDING", "CLEAN", "FLAGGED", "BLOCKED"].includes(st), `moderation.status = ${st}`);
    r = await api(s.adminToken, "POST", "/admin/moderation/rescan");
    assert.equal(r.status, 200, `quét lại: ${r.status} ${r.text}`);
    assert.ok(typeof r.data.scanned === "number", "rescan {scanned, pending}");
    r = await api(s.adminToken, "PUT", "/admin/dictionary/entries/k:%E9%A3%9F/sensitive", { sensitive: true, note: "smoke" });
    assert.equal(r.status, 200, `nhạy cảm: ${r.status} ${r.text}`);
    assert.equal(r.data.value, true); assert.equal(r.data.source, "admin");
    r = await api(s.adminToken, "GET", "/admin/dictionary/entries/k:%E9%A3%9F/sensitive");
    assert.equal(r.data.value, true, "đọc lại công tắc");
    r = await api(s.adminToken, "PUT", "/admin/dictionary/entries/k:%E9%A3%9F/sensitive", { sensitive: false });
    assert.equal(r.data.value, false);
    r = await api(s.adminToken, "GET", "/admin/stats?days=7");
    assert.equal(typeof r.data.openModeration, "number", "badge openModeration");
    assert.equal((await api(s.alice.token, "GET", "/admin/moderation")).status, 403, "USER bị 403");
    assert.equal((await api(s.adminToken, "GET", "/admin/moderation?status=XYZ")).status, 400, "status lạ -> 400");
});

await section("tự xoá tài khoản: Bob xoá -> ẩn danh, token vô hiệu; staff bị 403", async () => {
    assert.equal((await api(s.adminToken, "DELETE", "/auth/me", { password: "x" })).status, 403);
    assert.equal((await api(s.bob.token, "DELETE", "/auth/me", { password: "sai" })).status, 400);
    assert.equal((await api(s.bob.token, "DELETE", "/auth/me", { password: pw })).status, 204);
    assert.equal((await api(s.bob.token, "GET", "/auth/me")).status, 401);
    assert.equal((await api(null, "POST", "/auth/login", { email: s.bob.email, password: pw })).status, 401);
    let r = await api(s.adminToken, "GET", `/admin/users/${s.bob.id}`);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.fullName, "Người dùng đã xoá");
    assert.ok(r.data.email.startsWith("deleted+"), r.data.email);
    assert.ok(r.data.lockedAt, "tài khoản đã xoá bị khoá");
    r = await api(s.adminToken, "GET", "/admin/audit-logs?targetType=USER&size=100");
    assert.ok(r.data.items.some((a) => a.action === "USER_SELF_DELETE" && a.targetId === String(s.bob.id)), "audit USER_SELF_DELETE");
});

console.log(results.join("\n"));
process.exit(results.some((x) => x.startsWith("FAIL")) ? 1 : 0);
