// Chạy ai-service (FastAPI :8000), backend (Spring Boot :8080), đợi backend lên rồi chạy frontend (Vite :5173). Dùng: npm run dev
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const isWin = process.platform === "win32";

// Tiến trình mồ côi từ lần chạy trước (đóng terminal, VSCode kill...) vẫn giữ port
// -> Spring Boot chết ngay với "Port 8080 was already in use". Dọn trước khi start.
function freePort(port) {
    try {
        const out = execSync(
            isWin
                ? `netstat -ano | findstr /C:":${port} " | findstr LISTENING`
                : `lsof -ti tcp:${port} -s tcp:LISTEN`,
            { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
        );
        const pids = new Set(
            isWin
                ? out.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop())
                : out.trim().split(/\r?\n/)
        );
        for (const pid of pids) {
            if (!/^\d+$/.test(pid) || pid === "0") continue;
            console.log(`[dev] giải phóng cổng ${port} (PID ${pid})`);
            execSync(isWin ? `taskkill /PID ${pid} /T /F` : `kill -9 ${pid}`, { stdio: "ignore" });
        }
    } catch {
        // Không có gì nghe ở port này -> netstat/lsof trả rỗng, exit code khác 0. Bỏ qua.
    }
}

// BE_PORT phải khớp proxy trong frontend/vite.config.ts (mặc định 8080).
// 8081 là cổng các lần chạy tay trước đây hay dùng -> dọn luôn để không còn instance thứ hai
// cùng chạy migration/seed trên một DB.
const bePort = process.env.BE_PORT ?? "8080";
for (const port of new Set([bePort, "8081", "5173", "8000"])) freePort(port);

const procs = [];
let closing = false;

// optional: tiến trình phụ (ai-service) thoát thì chỉ báo, không tắt BE/FE
function start(tag, cmd, cwd, optional = false) {
    // shell: true vì trên Windows mvn/npm là file .cmd, spawn trực tiếp sẽ EINVAL
    const p = spawn(cmd, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    const print = (chunk) => {
        for (const line of chunk.toString().split(/\r?\n/)) {
            if (line.trim()) console.log(`[${tag}] ${line}`);
        }
    };
    p.stdout.on("data", print);
    p.stderr.on("data", print);
    p.on("error", (e) => console.error(`[${tag}] không chạy được "${cmd}": ${e.message}`));
    p.on("exit", (code) => {
        console.log(`[${tag}] thoát với code ${code}`);
        if (!optional) shutdown();
    });
    procs.push(p);
    return p;
}

// Cổng đã nhận kết nối = Spring Boot khởi động xong (Tomcat mở cổng sau khi context sẵn sàng).
const isPortOpen = (port) =>
    new Promise((resolve) => {
        const socket = net.connect({ port: Number(port), host: "localhost" });
        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.once("error", () => resolve(false));
    });

// Một tiến trình chết -> tắt tiến trình còn lại, không để mồ côi cổng 8080/5173
function shutdown() {
    if (closing) return;
    closing = true;
    for (const p of procs) {
        if (p.exitCode === null) {
            // Windows: SIGTERM không kết thúc cây tiến trình con của mvn/npm
            if (isWin) spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" });
            else p.kill("SIGTERM");
        }
    }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ai-service: dùng python trong venv nếu đã tạo (README bước 2), không có thì nhắc và vẫn chạy BE/FE
// (tính năng bóc tách tài liệu sẽ báo "Không kết nối được dịch vụ AI" cho tới khi ai-service lên).
const venvPython = path.join("ai-service", "venv", isWin ? "Scripts/python.exe" : "bin/python");
if (existsSync(venvPython)) {
    start("AI", `"${path.resolve(venvPython)}" -X utf8 -m uvicorn app.main:app --port 8000`, "ai-service", true);
} else {
    console.log("[dev] chưa có ai-service/venv -> bỏ qua ai-service (xem README bước 2)");
}

start("BE", `mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=${bePort}`, "backend-core");

// Chờ backend rồi mới bật Vite: nếu bật cùng lúc, tab trình duyệt đang mở reload và gọi /api
// khi Spring Boot còn đang khởi động -> hàng loạt "http proxy error ... ECONNREFUSED".
console.log(`[dev] chờ backend mở cổng ${bePort}...`);
while (!closing && !(await isPortOpen(bePort))) {
    await new Promise((r) => setTimeout(r, 1000));
}
if (!closing) {
    console.log(`[dev] backend sẵn sàng -> khởi động frontend`);
    start("FE", "npm run dev", "frontend");
}
