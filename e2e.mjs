// Smoke test trên DB cô lập: dựng backend (profile e2e = Postgres nhúng mới tinh) ở cổng riêng,
// chạy smoke-auth + smoke-crud gọi thẳng backend, rồi tắt. Không ghi rác vào Supabase.
// Dùng: npm run e2e   (E2E_PORT đổi cổng, mặc định 8082)
import { spawn, spawnSync } from "node:child_process";

const isWin = process.platform === "win32";
const port = process.env.E2E_PORT ?? "8082";
const base = `http://localhost:${port}/api`;

// Postgres nhúng của profile e2e (xem E2eDatabaseConfig.DATA_DIR_NAME). taskkill /F giết JVM trước khi
// kịp đóng Postgres -> postgres.exe mồ côi giữ RAM. Dọn theo tên thư mục dữ liệu, trước và sau khi chạy.
function killEmbeddedPostgres() {
    if (isWin) {
        spawnSync("powershell", ["-NoProfile", "-Command",
            "Get-CimInstance Win32_Process -Filter \"Name='postgres.exe'\" | " +
            "Where-Object { $_.CommandLine -like '*pbl6-e2e-pg*' } | " +
            "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], { stdio: "ignore" });
    } else {
        spawnSync("pkill", ["-f", "pbl6-e2e-pg"], { stdio: "ignore" });
    }
}
killEmbeddedPostgres();

const be = spawn(
    `mvn -q spring-boot:test-run -Dspring-boot.run.profiles=e2e -Dspring-boot.run.arguments=--server.port=${port}`,
    { cwd: "backend-core", shell: true, stdio: ["ignore", "pipe", "pipe"] }
);
let log = "";
be.stdout.on("data", (c) => (log += c));
be.stderr.on("data", (c) => (log += c));

function stop() {
    if (be.exitCode === null) {
        // Windows: phải kill cả cây (mvn -> java), không thì cổng bị giữ mồ côi
        if (isWin) spawnSync("taskkill", ["/pid", String(be.pid), "/T", "/F"], { stdio: "ignore" });
        else be.kill("SIGTERM");
    }
    killEmbeddedPostgres();
}
process.on("SIGINT", () => { stop(); process.exit(130); });

async function waitUp(timeoutMs = 180_000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        if (be.exitCode !== null) throw new Error(`backend thoát sớm (code ${be.exitCode})\n${log.slice(-3000)}`);
        try {
            await fetch(`${base}/auth/me`);
            return;
        } catch {
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
    throw new Error(`backend không lên sau ${timeoutMs / 1000}s\n${log.slice(-3000)}`);
}

let code = 0;
try {
    await waitUp();
    for (const script of ["smoke-auth.mjs", "smoke-crud.mjs"]) {
        const r = spawnSync(process.execPath, [script], { stdio: "inherit", env: { ...process.env, BASE_URL: base } });
        if (r.status !== 0) code = 1;
    }
} catch (e) {
    console.error(e.message);
    code = 1;
} finally {
    stop();
}
process.exit(code);
