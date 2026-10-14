// Lộ trình học tập end-to-end: cần backend + ai-service THẬT (SudachiPy, JLPT, JMdict) đang chạy ở AI_SERVICE_URL.
// Chạy trên DB cô lập: npm run e2e   |   Thủ công: node smoke-learning-path.mjs (backend 8080 qua frontend 5173 + ai-service 8000)
// Không có ai-service: lộ trình FAILED -> script báo lỗi rõ thay vì treo.
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:5173/api";
const pw = "secret123";
const TEXT = "第1課\n私は毎日日本語を勉強します。学校へ行きます。\n第2課\n友達と図書館で本を読みます。";
const DAYS = 3;

let token = null;
async function api(method, path, body, raw = false) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            ...(raw ? {} : { "Content-Type": "application/json" }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, text };
}

async function signUp() {
    const email = `path-${Date.now()}@test.com`;
    let r = await api("POST", "/auth/register", { email, password: pw, fullName: "Path" });
    assert.equal(r.status, 200, `register: ${r.status} ${r.text}`);
    r = await api("POST", "/auth/login", { email, password: pw });
    assert.equal(r.status, 200, `login: ${r.status} ${r.text}`);
    return r.data.accessToken;
}

async function waitDraft(id) {
    for (let i = 0; i < 120; i++) {
        const r = await api("GET", `/learning-paths/${id}`);
        assert.equal(r.status, 200, r.text);
        if (r.data.status === "DRAFT") return r.data;
        if (r.data.status === "FAILED") throw new Error(`lộ trình FAILED: ${r.data.errorMessage ?? r.data.job?.errorMessage}`);
        await new Promise((res) => setTimeout(res, 1000));
    }
    throw new Error("lộ trình không xong sau 120s");
}

function localToday() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const sumCards = (p) => p.chapters.reduce((s, c) => s + (c.cardCount ?? 0), 0);

const failures = [];
async function section(name, fn) {
    try {
        await fn();
        console.log(`  ok   ${name}`);
    } catch (e) {
        failures.push(name);
        console.log(`  FAIL ${name}: ${e.message}`);
    }
}

console.log("smoke-learning-path @", BASE);
token = await signUp();
let pathId = null;
let draft = null;
let before = 0;
let deckId = null;

await section("tạo lộ trình từ văn bản -> DRAFT, chương phủ đủ 3 ngày", async () => {
    const form = new FormData();
    form.append("text", TEXT);
    form.append("days", String(DAYS));
    form.append("options", JSON.stringify({ userLevel: "N5", levelFilter: "all", meaningLang: "en" }));
    const r = await api("POST", "/learning-paths", form, true);
    assert.equal(r.status, 202, r.text);
    assert.equal(r.data.status, "PROCESSING");
    pathId = r.data.id;
    draft = await waitDraft(pathId);
    console.log(`       chaptersDetected=${draft.chaptersDetected}, chapters=${draft.chapters.length}`);
    assert.ok(draft.chapters.length >= 1, JSON.stringify(draft.chapters));
    assert.equal(draft.chapters[0].dayFrom, 1);
    assert.equal(draft.chapters[draft.chapters.length - 1].dayTo, DAYS);
    before = sumCards(draft);
    assert.ok(before >= 1, `không có thẻ nào: ${JSON.stringify(draft.chapters)}`);
});

await section("danh sách chương có item; bỏ chọn một item -> cardCount giảm", async () => {
    const cid = draft.chapters[0].id;
    const items = await api("GET", `/learning-paths/${pathId}/chapters/${cid}/items`);
    assert.equal(items.status, 200, items.text);
    assert.ok(items.data.length > 0, "chương đầu không có item");
    const r = await api("PATCH", `/learning-paths/${pathId}/items`, [{ id: items.data[0].id, selected: false }]);
    assert.equal(r.status, 200, r.text);
    const p = await api("GET", `/learning-paths/${pathId}`);
    assert.equal(p.status, 200, p.text);
    const after = sumCards(p.data);
    assert.ok(after < before, `cardCount không giảm: ${before} -> ${after}`);
    draft = p.data;
});

await section("đổi tên lộ trình", async () => {
    const r = await api("PATCH", `/learning-paths/${pathId}`, { title: "Smoke path" });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.title, "Smoke path");
});

await section("kích hoạt -> ACTIVE, mỗi chương có bộ thẻ, hôm nay có mảng tasks", async () => {
    const r = await api("POST", `/learning-paths/${pathId}/activate`, { startDate: localToday() });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.data.status, "ACTIVE");
    assert.ok(r.data.chapters.length >= 1);
    assert.ok(r.data.chapters.every((c) => c.deckId != null), JSON.stringify(r.data.chapters));
    assert.ok(r.data.folderId != null, "thiếu folderId");
    assert.ok(r.data.today, "thiếu today");
    assert.ok(Array.isArray(r.data.today.tasks), JSON.stringify(r.data.today));
    deckId = r.data.chapters[0].deckId;
});

await section("bộ thẻ của chương tồn tại", async () => {
    const r = await api("GET", `/decks/${deckId}`);
    assert.equal(r.status, 200, r.text);
});

await section("dọn: xoá lộ trình, bộ thẻ còn nguyên", async () => {
    assert.equal((await api("DELETE", `/learning-paths/${pathId}`)).status, 204);
    assert.equal((await api("GET", `/decks/${deckId}`)).status, 200);
});

if (failures.length) {
    console.log(`\n${failures.length} section lỗi: ${failures.join(", ")}`);
    process.exit(1);
}
console.log("smoke-learning-path: tất cả section ok");
