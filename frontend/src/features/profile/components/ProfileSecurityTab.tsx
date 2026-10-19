import React, { useState } from "react";
import { useAuth } from "@/context/useAuth";
import { authService } from "@/features/auth/services/authService";
import { extractErrorMessage } from "@/services/apiClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SectionCard, StatusMessage, type Status } from "./ProfileUi";
import { useDialog } from "@/components/ui/dialogContext";

const PW_MIN = 6; // PasswordChangeRequest (backend)
const PW_MAX = 72; // BCrypt chỉ dùng 72 byte đầu

export const ProfileSecurityTab: React.FC = () => {
    const { login, logout, userEmail } = useAuth();
    const dialog = useDialog();
    const [deletePw, setDeletePw] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<Status>(null);

    // Form không điều khiển (FormData): mật khẩu không cần nằm trong state React.
    const changePassword = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        const current = String(data.get("currentPassword") ?? "");
        const next = String(data.get("newPassword") ?? "");
        const confirm = String(data.get("confirmPassword") ?? "");

        // Chặn lỗi hiển nhiên ở client; mật khẩu hiện tại vẫn do server xác minh.
        const clientError = !current
            ? "Vui lòng nhập mật khẩu hiện tại."
            : next.length < PW_MIN || next.length > PW_MAX
              ? `Mật khẩu mới phải từ ${PW_MIN} đến ${PW_MAX} ký tự.`
              : next !== confirm
                ? "Mật khẩu xác nhận không khớp."
                : next === current
                  ? "Mật khẩu mới phải khác mật khẩu hiện tại."
                  : "";
        if (clientError) {
            setStatus({ type: "error", text: clientError });
            return;
        }

        setSaving(true);
        setStatus(null);
        try {
            const { accessToken, refreshToken } = await authService.changePassword(current, next);
            // Token cũ (mọi thiết bị) đã bị thu hồi ở server -> dùng cặp token mới để không bị đăng xuất
            login(accessToken, refreshToken);
            form.reset();
            setShowPw(false);
            setStatus({ type: "success", text: "Đổi mật khẩu thành công." });
        } catch (err) {
            setStatus({ type: "error", text: extractErrorMessage(err) });
        } finally {
            setSaving(false);
        }
    };

    // Nghị định 13/2023: người dùng tự xoá dữ liệu cá nhân. Backend ẩn danh hoá tài khoản, xoá dữ liệu học và bộ thẻ riêng tư.
    const deleteAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        const ok = await dialog.confirm({
            title: "Xoá tài khoản vĩnh viễn?",
            message:
                "Bộ thẻ riêng tư, thư mục, lịch sử ôn tập và quiz của bạn bị xoá ngay và không khôi phục được. " +
                'Bộ thẻ đã chia sẻ công khai vẫn còn trong Thư viện dưới tên "Người dùng đã xoá". Người được bạn chia sẻ bộ thẻ riêng tư sẽ mất quyền xem.',
            confirmLabel: "Xoá tài khoản",
            tone: "danger",
            action: () => authService.deleteAccount(deletePw),
        });
        if (ok) logout();
    };

    const type = showPw ? "text" : "password";
    const toggle = (
        <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-pressed={showPw}
            aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            className="p-1 rounded text-on-surface-variant hover:text-on-surface cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                {showPw ? "visibility_off" : "visibility"}
            </span>
        </button>
    );

    return (
        <div className="grid gap-space-lg lg:grid-cols-[3fr_2fr] items-start">
            <SectionCard
                title="Đổi mật khẩu"
                description="Sau khi đổi, các thiết bị khác sẽ phải đăng nhập lại; phiên này vẫn giữ nguyên."
            >
                <form onSubmit={changePassword} className="flex flex-col gap-space-md" noValidate>
                    {/* Trình quản lý mật khẩu cần biết tài khoản nào đang đổi mật khẩu. */}
                    <input type="text" name="username" autoComplete="username" value={userEmail ?? ""} readOnly hidden />
                    <Input
                        name="currentPassword"
                        label="Mật khẩu hiện tại"
                        type={type}
                        required
                        autoComplete="current-password"
                        rightAction={toggle}
                    />
                    <Input
                        name="newPassword"
                        label="Mật khẩu mới"
                        type={type}
                        required
                        minLength={PW_MIN}
                        autoComplete="new-password"
                        helperText={`Tối thiểu ${PW_MIN} ký tự.`}
                    />
                    <Input
                        name="confirmPassword"
                        label="Xác nhận mật khẩu mới"
                        type={type}
                        required
                        autoComplete="new-password"
                    />
                    <StatusMessage status={status} />
                    <Button type="submit" className="self-start" isLoading={saving}>
                        Đổi mật khẩu
                    </Button>
                </form>
            </SectionCard>

            <section className="rounded-xl border border-error/20 bg-error-container/30 p-space-lg flex flex-col gap-space-md">
                <div>
                    <h2 className="font-headline-sm text-headline-sm text-error flex items-center gap-1.5">
                        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                            logout
                        </span>
                        Phiên đăng nhập
                    </h2>
                    <p className="text-body-sm text-on-surface-variant mt-0.5">
                        Đăng xuất khỏi trình duyệt này. Tiến độ học đã được lưu trên máy chủ.
                    </p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    onClick={logout}
                    className="self-start !border-error/40 !text-error hover:!bg-error-container/50 focus:!ring-error/30"
                >
                    Đăng xuất khỏi tài khoản
                </Button>
            </section>

            <section className="rounded-xl border border-error/40 bg-error-container/40 p-space-lg flex flex-col gap-space-md lg:col-span-2">
                <div>
                    <h2 className="font-headline-sm text-headline-sm text-error flex items-center gap-1.5">
                        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                            delete_forever
                        </span>
                        Xoá tài khoản
                    </h2>
                    <p className="text-body-sm text-on-surface-variant mt-0.5">
                        Xoá vĩnh viễn dữ liệu cá nhân, bộ thẻ riêng tư, thư mục và lịch sử học. Bộ thẻ đã công khai được giữ lại ẩn danh.
                        Không thể hoàn tác.
                    </p>
                </div>
                <form onSubmit={deleteAccount} className="flex flex-col sm:flex-row sm:items-end gap-space-md" noValidate>
                    <Input
                        name="deletePassword"
                        label="Nhập mật khẩu để xác nhận"
                        type="password"
                        required
                        autoComplete="current-password"
                        value={deletePw}
                        onChange={(ev) => setDeletePw(ev.target.value)}
                        className="sm:w-72"
                    />
                    <Button type="submit" variant="danger" disabled={!deletePw} className="self-start">
                        Xoá tài khoản của tôi
                    </Button>
                </form>
            </section>
        </div>
    );
};
