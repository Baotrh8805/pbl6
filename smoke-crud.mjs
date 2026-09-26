// CRUD end-to-end: Folder, Deck, Flashcard, User + phân quyền sai (IDOR).
// Chạy trên DB cô lập: npm run e2e   |   Hoặc thủ công: node smoke-crud.mjs (cần frontend 5173 + backend 8080)
// Mỗi section chạy độc lập: 1 section đỏ không chặn các section sau; dọn dữ liệu ở finally.
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:5173/api";
const pw = "secret123";

let token = null;
async function api(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, text };
}

async function signUp(tag) {
    const email = `crud-${tag}-${Date.now()}@test.com`;
    let r = await api("POST", "/auth/register", { email, password: pw, fullName: `User ${tag}` });
    assert.equal(r.status, 200, `register: ${r.status} ${r.text}`);
    r = await api("POST", "/auth/login", { email, password: pw });
    assert.equal(r.status, 200, `login: ${r.status} ${r.text}`);
    return { email, token: r.data.accessToken };
}

const failures = [];
async function section(name, fn) {
    try {
        await fn();
        console.log(`  ok   ${name}`);
    } catch (e) {
        failures.push(name);
        console.log(`  FAIL ${name}\n       ${e.message.split("\n").join("\n       ")}`);
    }
}

// Dọn theo thứ tự ngược lúc tạo; bỏ qua lỗi (có thể đã bị xoá bởi chính test).
const created = [];
const track = (kind, id, owner) => created.push({ kind, id, owner });

const alice = await signUp("a");
const bob = await signUp("b");
token = alice.token;
const s = {}; // trạng thái dùng chung giữa các section

try {
    await section("Folder: create/read + validate", async () => {
        let r = await api("POST", "/folders", { title: "Kanji", level: "N5" });
        assert.equal(r.status, 201, `tạo folder: ${r.status} ${r.text}`);
        s.folder = r.data;
        track("folder", s.folder.id, alice);

        r = await api("GET", "/folders");
        assert.equal(r.status, 200);
        assert.ok(r.data.some((f) => f.id === s.folder.id), "folder vừa tạo phải có trong danh sách");

        assert.equal((await api("POST", "/folders", { title: "   " })).status, 400, "title toàn khoảng trắng phải 400");
        assert.equal((await api("POST", "/folders", { title: "x".repeat(101) })).status, 400, "title quá 100 ký tự phải 400");
        assert.equal((await api("POST", "/folders", { title: "Bad", level: "N9" })).status, 400, "level sai phải 400");
        assert.equal((await api("POST", "/folders", { title: "kanji" })).status, 409, "trùng tên cùng cấp phải 409");

        r = await api("PUT", `/folders/${s.folder.id}`, { title: "Kanji", parentId: s.folder.id });
        assert.equal(r.status, 400, `lồng folder vào chính nó phải 400, nhận ${r.status}`);

        r = await api("PUT", `/folders/${s.folder.id}`, { title: "Kanji N4" });
        assert.equal(r.status, 200, `sửa folder: ${r.status} ${r.text}`);
        assert.equal(r.data.title, "Kanji N4");
        assert.equal(r.data.level, "N5", "sửa mỗi title không được xoá level");
    });

    await section("Deck: create trong folder + IDOR", async () => {
        let r = await api("POST", "/decks", {
            title: "Bộ thẻ test",
            level: "N5",
            folderId: s.folder.id,
            cards: [{ term: " 犬 ", meaning: " chó " }, { term: "猫", meaning: "mèo" }],
        });
        assert.equal(r.status, 201, `tạo deck: ${r.status} ${r.text}`);
        s.deck = r.data;
        track("deck", s.deck.id, alice);
        assert.equal(s.deck.cards.length, 2);
        assert.equal(s.deck.cards[0].term, "犬", "term phải được trim");

        token = bob.token;
        try {
            r = await api("POST", "/decks", { title: "Trộm folder", level: "N5", folderId: s.folder.id });
            assert.equal(r.status, 400, `dùng folder người khác phải 400, nhận ${r.status}`);
            assert.equal((await api("GET", "/folders")).data.length, 0, "Bob không được thấy folder của Alice");
            assert.equal((await api("PUT", `/folders/${s.folder.id}`, { title: "Hacked" })).status, 403, "Bob sửa folder Alice phải 403");
            assert.equal((await api("DELETE", `/folders/${s.folder.id}`)).status, 403, "Bob xoá folder Alice phải 403");
            assert.equal((await api("PUT", `/decks/${s.deck.id}`, { title: "Hacked", level: "N5" })).status, 404, "Bob sửa deck Alice phải 404");
            assert.equal((await api("DELETE", `/decks/${s.deck.id}`)).status, 404, "Bob xoá deck Alice phải 404");
        } finally {
            token = alice.token;
        }
    });

    await section("Flashcard: create/update/delete", async () => {
        let r = await api("POST", `/decks/${s.deck.id}/cards`, { term: " 鳥 ", meaning: " chim " });
        assert.equal(r.status, 201, `thêm thẻ: ${r.status} ${r.text}`);
        s.card = r.data;
        assert.equal(s.card.term, "鳥", "term phải được trim");

        assert.equal((await api("POST", `/decks/${s.deck.id}/cards`, { term: "", meaning: "rỗng" })).status, 400, "term rỗng phải 400");

        r = await api("PUT", `/decks/${s.deck.id}/cards/${s.card.id}`, { term: "鳥", meaning: "con chim" });
        assert.equal(r.status, 200, `sửa thẻ: ${r.status} ${r.text}`);
        assert.equal(r.data.meaning, "con chim");

        assert.equal((await api("PUT", `/decks/${s.deck.id}/cards/khong-ton-tai`, { term: "a", meaning: "b" })).status, 404);
    });

    await section("Deck update giữ id thẻ + lịch sử SRS", async () => {
        let r = await api("POST", "/reviews", { cardId: s.deck.cards[0].id, grade: "good" });
        assert.ok(r.status < 300, `submit review: ${r.status} ${r.text}`);

        r = await api("PUT", `/decks/${s.deck.id}`, {
            title: "Bộ thẻ test (đã sửa)",
            level: "N5",
            folderId: s.folder.id,
            cards: [
                { id: s.deck.cards[0].id, term: "犬", meaning: "chó nhà" },
                { id: s.deck.cards[1].id, term: "猫", meaning: "mèo" },
                { id: s.card.id, term: "鳥", meaning: "con chim" },
            ],
        });
        assert.equal(r.status, 200, `sửa deck: ${r.status} ${r.text}`);
        assert.equal(r.data.cards.find((c) => c.id === s.deck.cards[0].id)?.meaning, "chó nhà", "id thẻ phải giữ nguyên khi sửa deck");

        r = await api("GET", "/reviews");
        assert.ok(r.data.some((v) => v.cardId === s.deck.cards[0].id), "lịch sử SRS không được mất sau khi sửa deck");
    });

    await section("Thêm bộ thẻ vào thư mục (dashboard)", async () => {
        let r = await api("POST", "/decks", { title: "Bộ thẻ tạo mới trong thư mục", level: "N3", folderId: s.folder.id });
        assert.equal(r.status, 201, `tạo deck rỗng trong folder: ${r.status} ${r.text}`);
        const newDeck = r.data;
        track("deck", newDeck.id, alice);
        assert.equal(newDeck.folderId ?? newDeck.folder?.id, s.folder.id, "deck mới phải nằm trong folder đích");

        r = await api("POST", "/decks", { title: "Bộ thẻ chưa phân loại", level: "N5" });
        assert.equal(r.status, 201);
        const loose = r.data;
        track("deck", loose.id, alice);
        r = await api("PUT", `/decks/${loose.id}`, { title: loose.title, level: loose.level, folderId: s.folder.id });
        assert.equal(r.status, 200, `chuyển deck vào folder: ${r.status} ${r.text}`);

        r = await api("GET", `/decks?folderId=${s.folder.id}`);
        const idsInFolder = r.data.map((d) => d.id);
        assert.ok(idsInFolder.includes(newDeck.id) && idsInFolder.includes(loose.id), "cả 2 bộ thẻ phải hiện trong thư mục");

        assert.equal((await api("DELETE", `/decks/${newDeck.id}`)).status, 204);
        assert.equal((await api("DELETE", `/decks/${loose.id}`)).status, 204);
    });

    await section("Thiếu / hỏng token -> 401 (A2)", async () => {
        token = null;
        try {
            assert.equal((await api("GET", "/auth/me")).status, 401, "không token phải 401");
            token = "garbage";
            assert.equal((await api("GET", "/folders")).status, 401, "token rác phải 401");
        } finally {
            token = alice.token;
        }
    });

    await section("User: read/update", async () => {
        let r = await api("PUT", "/auth/jlpt-level", { jlptLevel: "N4" });
        assert.equal(r.status, 200, `đổi JLPT: ${r.status} ${r.text}`);
        assert.equal((await api("PUT", "/auth/jlpt-level", { jlptLevel: "N9" })).status, 400, "level sai phải 400");

        r = await api("PUT", "/auth/profile", { fullName: "Alice Updated" });
        assert.equal(r.status, 200, `sửa hồ sơ: ${r.status} ${r.text}`);
        r = await api("GET", "/auth/me");
        assert.equal(r.data.fullName, "Alice Updated");
        assert.equal(r.data.jlptLevel, "N4", "sửa tên không được xoá jlptLevel");
    });

    await section("Độ dài hợp lệ theo DTO không được 500 (A3)", async () => {
        let r = await api("POST", "/decks", { title: "Dài", level: "N5", description: "d".repeat(1000),
            cards: [{ term: "t".repeat(200), meaning: "m".repeat(500), example: "e".repeat(1000) }] });
        assert.equal(r.status, 201, `deck với trường dài đúng giới hạn: ${r.status}`);
        track("deck", r.data.id, alice);
        r = await api("POST", "/decks", { title: "Quá dài", level: "N5", cards: [{ term: "t".repeat(201), meaning: "m" }] });
        assert.equal(r.status, 400, `thẻ lồng vượt giới hạn phải 400, nhận ${r.status}`);
    });

    await section("Bớt thẻ ở giữa: SRS không nhảy sang thẻ khác (A4)", async () => {
        let r = await api("POST", "/decks", { title: "SRS", level: "N5",
            cards: [{ term: "A", meaning: "a" }, { term: "B", meaning: "b" }, { term: "C", meaning: "c" }] });
        const d = r.data;
        track("deck", d.id, alice);
        const [a, b, c] = d.cards;
        await api("POST", "/reviews", { cardId: b.id, grade: "easy" });
        r = await api("PUT", `/decks/${d.id}`, { title: d.title, level: "N5",
            cards: [{ id: a.id, term: "A", meaning: "a" }, { id: c.id, term: "C", meaning: "c" }] });
        assert.equal(r.status, 200, `sửa deck: ${r.status} ${r.text}`);
        assert.deepEqual(r.data.cards.map((x) => x.id), [a.id, c.id], "thẻ A, C giữ nguyên id");
        r = await api("GET", "/reviews");
        assert.ok(!r.data.some((v) => v.cardId === b.id), "review của B phải bị xoá cùng thẻ B");
    });

    await section("Review vào thẻ của người khác -> 404 (A10)", async () => {
        token = bob.token;
        try {
            const r = await api("POST", "/reviews", { cardId: s.deck.cards[0].id, grade: "good" });
            assert.equal(r.status, 404, `Bob review thẻ riêng của Alice phải 404, nhận ${r.status}`);
        } finally {
            token = alice.token;
        }
    });

    await section("Xoá folder cha khi con trùng tên ở gốc -> 409 rõ nghĩa (A5)", async () => {
        const root = (await api("POST", "/folders", { title: "Trung" })).data;
        track("folder", root.id, alice);
        const parent = (await api("POST", "/folders", { title: "Cha" })).data;
        track("folder", parent.id, alice);
        const child = (await api("POST", "/folders", { title: "trung", parentId: parent.id })).data;
        track("folder", child.id, alice);
        const r = await api("DELETE", `/folders/${parent.id}`);
        assert.equal(r.status, 409);
        assert.match(r.text, /trung/, `thông báo phải nêu tên thư mục con bị trùng, nhận: ${r.text}`);
    });

    await section("DELETE: thẻ, folder (con về gốc, deck còn nguyên), deck", async () => {
        assert.equal((await api("DELETE", `/decks/${s.deck.id}/cards/${s.card.id}`)).status, 204);

        let r = await api("POST", "/folders", { title: "Con", parentId: s.folder.id });
        assert.equal(r.status, 201);
        const child = r.data;
        track("folder", child.id, alice);

        assert.equal((await api("DELETE", `/folders/${s.folder.id}`)).status, 204);
        r = await api("GET", "/folders");
        const stillThere = r.data.find((f) => f.id === child.id);
        assert.ok(stillThere, "folder con phải được đẩy về gốc, không bị xoá theo");
        assert.equal(stillThere.parentId, null);
        assert.equal((await api("GET", `/decks/${s.deck.id}`)).status, 200, "deck không bị xoá khi xoá folder");
        assert.equal((await api("GET", `/decks/${s.deck.id}`)).data.folderId ?? null, null, "deck về 'chưa xếp'");

        assert.equal((await api("DELETE", `/decks/${s.deck.id}`)).status, 204);
        assert.equal((await api("GET", `/decks/${s.deck.id}`)).status, 404, "deck đã xoá phải 404");
    });
} finally {
    for (const { kind, id, owner } of created.reverse()) {
        token = owner.token;
        await api("DELETE", kind === "deck" ? `/decks/${id}` : `/folders/${id}`).catch(() => {});
    }
}

if (failures.length) {
    console.error(`FAIL - ${failures.length} section đỏ: ${failures.join("; ")}`);
    process.exit(1);
}
console.log("OK - CRUD Folder/Deck/Flashcard/User + phân quyền sai");
