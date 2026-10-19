import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Mail } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SERVER_PENDING_MESSAGE } from "@/lib/apiErrorInfo";
import { authErrorMessage, authService } from "@/features/auth/services/authService";
import { ResendStatusLine } from "@/features/auth/components/ResendVerificationAction";
import { useResendVerification } from "@/features/auth/hooks/useResendVerification";
import { EMAIL_MAX } from "@/features/auth/authUtils";
import type { VerifyEmailResult } from "@/features/auth/types/auth.types";

// Mở từ link trong email kích hoạt: /verify-email?token=… (A1, hợp đồng API đợt 2 §3). Không bọc PublicRoute, như
// /reset-password: người đang đăng nhập bằng tài khoản khác vẫn kích hoạt được. Token chỉ dùng được một lần.

/** Form gửi lại liên kết khi link hỏng / hết hạn (người dùng tự nhập email vì token không cho biết email). */
const ResendForm: React.FC<{ defaultEmail?: string }> = ({ defaultEmail = "" }) => {
    const [email, setEmail] = useState(defaultEmail);
    const { send, busy, status, secondsLeft } = useResendVerification();
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                void send(email);
            }}
            className="flex flex-col gap-3 p-4 rounded-lg bg-surface-container-low border border-outline-variant/30"
            noValidate
        >
            <p className="text-xs text-on-surface-variant leading-relaxed">
                Liên kết kích hoạt chỉ dùng được một lần và hết hạn sau 24 giờ. Nhập email đã đăng ký để nhận liên kết mới.
            </p>
            <Input
                id="verify-resend-email"
                name="email"
                type="email"
                label="Email tài khoản"
                placeholder="tenban@example.com"
                autoComplete="email"
                maxLength={EMAIL_MAX}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftIcon={<Mail className="w-4 h-4" />}
            />
            <Button type="submit" variant="primary" size="md" isLoading={busy} disabled={secondsLeft > 0} className="w-full font-headline">
                {secondsLeft > 0 ? `Gửi lại sau ${secondsLeft} giây` : "Gửi lại email kích hoạt"}
            </Button>
            <ResendStatusLine status={status} />
        </form>
    );
};

export const VerifyEmailPage: React.FC = () => {
    const [params] = useSearchParams();
    const token = (params.get("token") ?? "").trim();
    const [outcome, setOutcome] = useState<{ token: string; result?: VerifyEmailResult; error?: string } | null>(null);
    // StrictMode chạy effect hai lần: token dùng một lần nên lần gọi thứ hai sẽ báo "hết hạn" đè lên thành công.
    // Giữ promise theo token và dùng lại thay vì gọi API lần nữa.
    const inflight = useRef<{ token: string; promise: Promise<VerifyEmailResult> } | null>(null);

    useEffect(() => {
        if (!token) return;
        let alive = true;
        if (inflight.current?.token !== token) inflight.current = { token, promise: authService.verifyEmail(token) };
        inflight.current.promise.then(
            (result) => {
                if (alive) setOutcome({ token, result });
            },
            (err: unknown) => {
                if (alive) setOutcome({ token, error: authErrorMessage(err) });
            }
        );
        return () => {
            alive = false;
        };
    }, [token]);

    const loading = !!token && outcome?.token !== token;
    const result = outcome?.token === token ? outcome.result : undefined;
    const error = outcome?.token === token ? outcome.error : undefined;

    return (
        <AuthLayout title="Xác thực email" subtitle="Kích hoạt tài khoản NihonGen AI của bạn.">
            {!token ? (
                <div className="flex flex-col gap-4">
                    <p role="alert" className="p-3.5 rounded-lg bg-error-container text-error text-xs border border-error/20">
                        Liên kết xác thực không hợp lệ hoặc thiếu mã. Hãy mở lại đúng liên kết trong email, hoặc gửi liên kết mới.
                    </p>
                    <ResendForm />
                    <Link to="/login" className="text-center text-xs text-primary font-semibold hover:underline">
                        Quay lại trang Đăng nhập
                    </Link>
                </div>
            ) : loading ? (
                <div role="status" aria-busy="true" className="flex items-center gap-3 p-4 rounded-lg bg-surface-container-low text-sm text-on-surface-variant">
                    <span
                        aria-hidden="true"
                        className="inline-block w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin shrink-0"
                    />
                    Đang xác thực email của bạn…
                </div>
            ) : result ? (
                <div className="flex flex-col gap-4">
                    <div role="status" className="flex items-start gap-3 p-4 rounded-lg bg-secondary/10 border border-secondary/30">
                        <CheckCircle2 aria-hidden="true" className="w-6 h-6 shrink-0 text-secondary mt-0.5" />
                        <div className="min-w-0 flex flex-col gap-1">
                            <p className="font-headline font-semibold text-sm text-on-surface">{result.message}</p>
                            {result.email && (
                                <p className="text-xs text-on-surface-variant break-all">
                                    Tài khoản <strong className="text-on-surface">{result.email}</strong> đã sẵn sàng.
                                </p>
                            )}
                        </div>
                    </div>
                    {/* registeredEmail: LoginForm điền sẵn ô email (cùng cơ chế với chuyển trang sau đăng ký). */}
                    <Link
                        to="/login"
                        state={result.email ? { registeredEmail: result.email } : undefined}
                        className="inline-flex items-center justify-center w-full px-6 py-3 rounded-lg bg-primary hover:bg-primary-deep text-white font-headline font-semibold text-base shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
                    >
                        Đăng nhập ngay
                    </Link>
                </div>
            ) : error === SERVER_PENDING_MESSAGE ? (
                <div className="flex flex-col gap-4">
                    <p role="status" className="p-3.5 rounded-lg bg-surface-container-low text-on-surface-variant text-sm border border-outline-variant/30">
                        {SERVER_PENDING_MESSAGE}
                    </p>
                    <Link to="/login" className="text-center text-xs text-primary font-semibold hover:underline">
                        Quay lại trang Đăng nhập
                    </Link>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    <p role="alert" className="p-3.5 rounded-lg bg-error-container text-error text-xs border border-error/20 leading-relaxed">
                        {error ?? "Không xác thực được email."}
                    </p>
                    <ResendForm />
                    <Link to="/login" className="text-center text-xs text-primary font-semibold hover:underline">
                        Đã kích hoạt trước đó? Đăng nhập
                    </Link>
                </div>
            )}
        </AuthLayout>
    );
};

export default VerifyEmailPage;
