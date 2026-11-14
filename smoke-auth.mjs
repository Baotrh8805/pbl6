// Kiểm chứng register -> login qua Vite proxy. Chạy: node smoke-auth.mjs
// Yêu cầu: frontend dev server (5173) + backend-core (8080) đang chạy.
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:5173/api";
const email = `smoke-${Date.now()}@test.com`;
const password = "Secret123!";

const post = (path, body) =>
    fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

// 1. Register thành công -> 200
let res = await post("/auth/register", { email, password, fullName: "Smoke Test" });
assert.equal(res.status, 200, `register: ${res.status} ${await res.text()}`);

// 2. Register trùng email -> 400
res = await post("/auth/register", { email, password, fullName: "Smoke Test" });
assert.equal(res.status, 400, `register trùng phải trả 400, nhận ${res.status}`);

// 3. Input không hợp lệ bị chặn tại boundary -> 400
res = await post("/auth/register", { email: "not-an-email", password: "12", fullName: "" });
assert.equal(res.status, 400, `input xấu phải trả 400, nhận ${res.status}`);

// 4. Login đúng -> 200 + đúng shape AuthResponse frontend mong đợi
res = await post("/auth/login", { email, password });
const loginBody = await res.text();
assert.equal(res.status, 200, `login: ${res.status} ${loginBody}`);
const auth = JSON.parse(loginBody);
assert.equal(auth.tokenType, "Bearer");
assert.equal(auth.accessToken?.split(".").length, 3, "accessToken phải là JWT 3 phần");
assert.ok(auth.refreshToken, "login phải trả refreshToken");

// 5. Sai mật khẩu và email không tồn tại -> cùng 401, cùng message (không leak user tồn tại)
const wrongPass = await post("/auth/login", { email, password: "WRONG_PASSWORD" });
const noUser = await post("/auth/login", { email: `ghost-${Date.now()}@test.com`, password });
assert.equal(wrongPass.status, 401, `sai mật khẩu phải 401, nhận ${wrongPass.status}`);
assert.equal(noUser.status, 401, `user không tồn tại phải 401, nhận ${noUser.status}`);
assert.equal(await wrongPass.text(), await noUser.text(), "message phải giống nhau để không lộ user");

// 6. Refresh token đổi được access token mới; logout thu hồi thì không dùng được nữa
res = await post("/auth/refresh", { refreshToken: auth.refreshToken });
assert.equal(res.status, 200, `refresh: ${res.status}`);
assert.equal((await res.json()).accessToken?.split(".").length, 3, "refresh phải trả JWT mới");
res = await post("/auth/logout", { refreshToken: auth.refreshToken });
assert.equal(res.status, 204, `logout: ${res.status}`);
res = await post("/auth/refresh", { refreshToken: auth.refreshToken });
assert.equal(res.status, 401, `refresh sau logout phải 401, nhận ${res.status}`);

console.log(`OK - register -> login -> refresh -> logout end-to-end qua proxy (${email})`);
