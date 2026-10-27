import { useEffect, useRef, useState } from "react";
import { authErrorMessage, authService } from "../services/authService";
import { EMAIL_RE, cooldownSecondsLeft } from "../authUtils";

/** Chờ giữa hai lần gửi lại: máy chủ chỉ cho 5 lần / 15 phút, bấm dồn dập chỉ tốn lượt và dễ dính 429. */
export const RESEND_COOLDOWN_SECONDS = 30;

export type ResendStatus = { type: "success" | "error" | "info"; text: string } | null;

/**
 * Gửi lại email kích hoạt (POST /auth/resend-verification) dùng chung cho form đăng ký, form đăng nhập và trang
 * xác thực: trạng thái gửi, thông báo, đếm ngược trước lần bấm tiếp theo.
 */
export const useResendVerification = () => {
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<ResendStatus>(null);
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [now, setNow] = useState(0);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    // Đồng hồ chỉ chạy trong lúc đếm ngược, tự dừng khi hết giờ.
    useEffect(() => {
        if (cooldownUntil === 0) return;
        const tick = () => {
            const t = Date.now();
            setNow(t);
            if (t >= cooldownUntil) window.clearInterval(id);
        };
        const id = window.setInterval(tick, 1000);
        tick();
        return () => window.clearInterval(id);
    }, [cooldownUntil]);

    const secondsLeft = cooldownUntil === 0 ? 0 : cooldownSecondsLeft(cooldownUntil, now);

    const send = async (rawEmail: string) => {
        const email = rawEmail.trim();
        if (!EMAIL_RE.test(email)) {
            setStatus({ type: "error", text: "Email không đúng định dạng" });
            return;
        }
        if (busy || secondsLeft > 0) return;
        setBusy(true);
        setStatus(null);
        try {
            const message = await authService.resendVerification(email);
            if (!mounted.current) return;
            setStatus({ type: "success", text: `${message} Hãy kiểm tra cả thư mục Spam.` });
            const until = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
            setNow(Date.now());
            setCooldownUntil(until);
        } catch (err) {
            if (!mounted.current) return;
            const text = authErrorMessage(err);
            setStatus({ type: "error", text });
        } finally {
            if (mounted.current) setBusy(false);
        }
    };

    return { send, busy, status, secondsLeft };
};
