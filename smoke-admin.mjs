// Smoke test Admin Panel (G0 của docs/Plan/plans/2026-10-18-admin-roadmap.md): đi qua mọi endpoint /api/admin/**.
// Chạy trên DB cô lập: BASE_URL=http://localhost:8082/api node smoke-admin.mjs (backend profile e2e, có seed V15).
// Mỗi section độc lập: 1 section đỏ không chặn section sau.
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:8082/api";
const pw = "secret123";

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
