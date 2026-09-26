import React, { useState } from "react";
import { useAuth } from "@/context/useAuth";
import { authService } from "@/features/auth/services/authService";
import { fetchQuizResults } from "@/services/studyService";
import { useAsync } from "@/lib/useAsync";
import { extractErrorMessage } from "@/services/apiClient";

export const ProfilePage: React.FC = () => {
    const { userProfile, userEmail, refreshProfile, login } = useAuth();
    const results = useAsync(fetchQuizResults, []);

    const [infoMsg, setInfoMsg] = useState("");
    const [pwMsg, setPwMsg] = useState("");
    const [busy, setBusy] = useState(false);

    const saveInfo = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        try {
            await authService.updateProfile(String(form.get("fullName")));
            await refreshProfile();
            setInfoMsg("Đã lưu thông tin.");
        } catch (err) {
            setInfoMsg(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const changePassword = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        setBusy(true);
        try {
            // Mật khẩu hiện tại do server xác minh (AuthService.changePassword)
            const { accessToken } = await authService.changePassword(
                String(data.get("currentPassword")),
                String(data.get("newPassword"))
            );
            // Token cũ đã bị thu hồi ở server -> dùng token mới để không bị đăng xuất
            login(accessToken);
            form.reset();
            setPwMsg("Đổi mật khẩu thành công.");
        } catch (err) {
            setPwMsg(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const inputClass =
        "p-2.5 rounded-lg bg-surface-container-lowest border border-surface-container-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

    return (
        <section className="flex flex-col gap-space-lg pb-space-xl max-w-xl">
            <h1 className="font-headline-sm text-headline-sm font-bold">Trang cá nhân</h1>

            <form onSubmit={saveInfo} className="flex flex-col gap-space-sm">
                <h2 className="font-title-md text-title-md font-semibold">Thông tin</h2>

                <label className="flex flex-col gap-1 text-label-md">
                    <span>Email</span>
                    <input
                        type="email"
                        value={userProfile?.email ?? userEmail ?? ""}
                        readOnly
                        className={`${inputClass} text-on-surface-variant`}
                    />
                </label>

                <label className="flex flex-col gap-1 text-label-md">
                    <span>Họ tên</span>
                    {/* Validate bằng HTML, không cần state cho form */}
                    <input
                        name="fullName"
                        required
                        maxLength={100}
                        defaultValue={userProfile?.fullName ?? ""}
                        key={userProfile?.fullName}
                        className={inputClass}
                    />
                </label>

                <p aria-live="polite" className="text-label-md text-on-surface-variant">
                    {infoMsg}
                </p>
                <button
                    type="submit"
                    disabled={busy}
                    className="self-start px-4 py-2.5 rounded-lg bg-primary text-on-primary font-label-md font-semibold disabled:opacity-60"
                >
                    Lưu
                </button>
            </form>

            <form onSubmit={changePassword} className="flex flex-col gap-space-sm">
                <h2 className="font-title-md text-title-md font-semibold">Đổi mật khẩu</h2>

                <label className="flex flex-col gap-1 text-label-md">
                    <span>Mật khẩu hiện tại</span>
                    <input
                        name="currentPassword"
                        type="password"
                        required
                        autoComplete="current-password"
                        className={inputClass}
                    />
                </label>

                <label className="flex flex-col gap-1 text-label-md">
                    <span>Mật khẩu mới (tối thiểu 6 ký tự)</span>
                    <input
                        name="newPassword"
                        type="password"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        className={inputClass}
                    />
                </label>

                <p aria-live="polite" className="text-label-md text-on-surface-variant">
                    {pwMsg}
                </p>
                <button
                    type="submit"
                    disabled={busy}
                    className="self-start px-4 py-2.5 rounded-lg bg-primary text-on-primary font-label-md font-semibold disabled:opacity-60"
                >
                    Đổi mật khẩu
                </button>
            </form>

            <div className="flex flex-col gap-space-sm">
                <h2 className="font-title-md text-title-md font-semibold">Lịch sử kiểm tra</h2>
                <div aria-live="polite" className="text-body-sm text-on-surface-variant">
                    {results.loading && "Đang tải..."}
                    {results.error}
                    {!results.loading && !results.error && results.data?.length === 0 && "Chưa có bài kiểm tra nào."}
                </div>
                {results.data && results.data.length > 0 && (
                    <table className="w-full text-body-sm">
                        <caption className="sr-only">10 bài kiểm tra gần nhất</caption>
                        <thead className="text-label-md text-on-surface-variant text-left">
                            <tr>
                                <th scope="col">Bộ thẻ</th>
                                <th scope="col">Điểm</th>
                                <th scope="col">Thời gian</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.data.map((r) => (
                                <tr key={r.createdAt} className="border-t border-surface-container-high">
                                    <td className="py-1.5">{r.deckId}</td>
                                    <td>
                                        {r.score}/{r.total}
                                    </td>
                                    <td>{new Date(r.createdAt).toLocaleString("vi-VN")}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </section>
    );
};

export default ProfilePage;
