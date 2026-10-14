// Bóc tách tài liệu end-to-end: cần backend + ai-service THẬT (SudachiPy, JLPT, JMdict) đang chạy ở AI_SERVICE_URL.
// Chạy trên DB cô lập: npm run e2e   |   Thủ công: node smoke-extraction.mjs (backend 8080 qua frontend 5173 + ai-service 8000)
// Không có ai-service: job FAILED -> script báo lỗi rõ thay vì treo.
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:5173/api";
const pw = "secret123";
const TEXT = "毎日漢字を勉強しなければならない。昨日、友達と新しい映画を見に行きました。日本語の文法は難しいですが、面白いです。";

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
    const email = `extract-${Date.now()}@test.com`;
    let r = await api("POST", "/auth/register", { email, password: pw, fullName: "Extract" });
    assert.equal(r.status, 200, `register: ${r.status} ${r.text}`);
    r = await api("POST", "/auth/login", { email, password: pw });
    assert.equal(r.status, 200, `login: ${r.status} ${r.text}`);
    return r.data.accessToken;
}

async function waitDone(id) {
    for (let i = 0; i < 120; i++) {
        const r = await api("GET", `/extractions/${id}?includeText=true`);
        assert.equal(r.status, 200, r.text);
        if (r.data.status === "DONE") return r.data;
        if (r.data.status === "FAILED") throw new Error(`job FAILED: ${r.data.errorMessage}`);
        await new Promise((res) => setTimeout(res, 1000));
    }
    throw new Error("job không xong sau 120s");
}

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

console.log("smoke-extraction @", BASE);
token = await signUp();
let jobId = null;
let deckId = null;

await section("dán văn bản -> job DONE với từ vựng + ngữ pháp", async () => {
    const form = new FormData();
    form.append("text", TEXT);
    form.append("options", JSON.stringify({ userLevel: "N5", levelFilter: "all", meaningLang: "en" }));
    const r = await api("POST", "/extractions", form, true);
    assert.equal(r.status, 202, r.text);
    jobId = r.data.id;
    const job = await waitDone(jobId);
    assert.equal(job.stage, "DONE");
    assert.ok(job.stats.vocab >= 5, `ít từ vựng: ${JSON.stringify(job.stats)}`);
    assert.ok(job.stats.grammar >= 1, `không thấy mẫu ngữ pháp: ${JSON.stringify(job.stats)}`);
    assert.ok(job.extractedText.includes("勉強"));
});

await section("items có cách đọc, furigana từng chữ, Hán-Việt, cấp JLPT", async () => {
    const r = await api("GET", `/extractions/${jobId}/items?kind=vocab`);
    assert.equal(r.status, 200, r.text);
    const benkyo = r.data.find((i) => i.term === "勉強");
    assert.ok(benkyo, "thiếu 勉強");
    assert.equal(benkyo.reading, "べんきょう");
    assert.equal(benkyo.readingSegments?.length, 2, JSON.stringify(benkyo.readingSegments));
    assert.ok(benkyo.hanViet, "thiếu Hán-Việt");
    assert.ok(/^N[1-5]$/.test(benkyo.level), `cấp: ${benkyo.level}`);
    const g = await api("GET", `/extractions/${jobId}/items?kind=grammar`);
    assert.ok(g.data.some((i) => i.term.includes("なければならない")), g.data.map((i) => i.term).join(", "));
});

await section("tạo bộ thẻ từ vựng + ngữ pháp, thẻ giữ metadata", async () => {
    const r = await api("POST", `/extractions/${jobId}/decks`, {
        vocab: { title: "Smoke từ vựng" },
        grammar: { title: "Smoke ngữ pháp" },
    });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.data.length, 2);
    deckId = r.data[0].id;
    assert.equal(r.data[0].category, "goi");
    assert.equal(r.data[1].category, "bunpou");
    const card = r.data[0].cards.find((c) => c.term === "勉強");
    assert.ok(card && card.readingSegments && card.hanViet && card.level, JSON.stringify(card));
    const deck = await api("GET", `/decks/${deckId}`);
    assert.equal(deck.status, 200);
    assert.ok(deck.data.cards.length >= 5);
});

await section("sửa văn bản -> phân tích lại", async () => {
    const r = await api("PUT", `/extractions/${jobId}/text`, { text: "猫が好きです。" });
    assert.equal(r.status, 202, r.text);
    const job = await waitDone(jobId);
    const items = await api("GET", `/extractions/${jobId}/items`);
    assert.ok(items.data.some((i) => i.term === "猫"), items.data.map((i) => i.term).join(", "));
    assert.equal(job.deckIds.length, 2); // bộ thẻ đã tạo vẫn ghi nhận
});

await section("dọn: xoá job, bộ thẻ còn nguyên", async () => {
    assert.equal((await api("DELETE", `/extractions/${jobId}`)).status, 204);
    assert.equal((await api("GET", `/decks/${deckId}`)).status, 200);
});

if (failures.length) {
    console.log(`\n${failures.length} section lỗi: ${failures.join(", ")}`);
    process.exit(1);
}
console.log("smoke-extraction: tất cả section ok");
