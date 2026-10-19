import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { atLeast } from "@/lib/roles";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchSettings, updateSettings } from "@/services/adminService";
import type { AdminSettings } from "@/types/api.types";
import { formatShort } from "@/features/admin/adminUtils";
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";
import { AdminDetailCard } from "@/features/admin/components/AdminDetailCard";
import { adminFieldClass } from "@/features/admin/components/AdminFilterBar";

export const AdminSettingsPage: React.FC = () => {
  const { userProfile } = useAuth();
  const canEdit = atLeast(userProfile?.role, "SUPER_ADMIN");
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useAsync(fetchSettings, [reload]);
  const [draft, setDraft] = useState<AdminSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  if (loading) return <p className="text-on-surface-variant p-space-md">Đang tải cấu hình...</p>;
  if (error || !data) {
    return (
      <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
        {error ?? "Không tải được cấu hình."}
      </p>
    );
  }
  const s = draft ?? data;
  const dirty =
    s.extraction_daily_limit_free !== data.extraction_daily_limit_free ||
    s.extraction_daily_limit_premium !== data.extraction_daily_limit_premium ||
    s.announcement !== data.announcement ||
    s.registration_open !== data.registration_open;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !dirty) return;
    setSaving(true);
    setStatus(null);
    try {
      await updateSettings({
        extraction_daily_limit_free: s.extraction_daily_limit_free,
        extraction_daily_limit_premium: s.extraction_daily_limit_premium,
        announcement: s.announcement,
        registration_open: s.registration_open,
      });
      setDraft(null);
      setStatus({ ok: true, text: "Đã lưu và áp dụng cấu hình toàn hệ thống." });
      setReload((n) => n + 1);
    } catch (err) {
      setStatus({ ok: false, text: extractErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl max-w-3xl">
      <AdminPageHeader
        title="Cấu hình hệ thống"
        description={`Các thiết lập có hiệu lực ngay lập tức. Cập nhật lần cuối: ${formatShort(data.updatedAt)}`}
        actions={
          <div className="flex items-center gap-2">
            {!canEdit && (
              <span className="text-label-sm text-outline font-medium">Chỉ Super Admin có quyền sửa</span>
            )}
            {canEdit && (
              <Button
                type="submit"
                form="settings-form"
                variant="primary"
                size="sm"
                isLoading={saving}
                disabled={!dirty}
              >
                Lưu cấu hình
              </Button>
            )}
          </div>
        }
      />

      {status && (
        <div
          role={status.ok ? "status" : "alert"}
          className={`p-space-sm rounded-xl border text-body-sm flex items-center justify-between gap-2 ${
            status.ok ? "bg-secondary-container/20 border-secondary/30 text-secondary" : "bg-error/10 border-error/20 text-error"
          }`}
        >
          <span>{status.text}</span>
          <button type="button" onClick={() => setStatus(null)} className="text-outline hover:text-on-surface">✕</button>
        </div>
      )}

      <form id="settings-form" onSubmit={handleSubmit} className="flex flex-col gap-space-lg">
        {/* Card 1: Hạn mức bóc tách AI */}
        <AdminDetailCard
          title="Hạn mức bóc tách AI"
          icon="psychology"
          description="Giới hạn số tài liệu/văn bản người dùng có thể yêu cầu AI xử lý trong một ngày."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5 p-3 rounded-xl bg-surface-container-low border border-surface-container-high">
              <span className="font-semibold text-body-sm">Tài khoản Free</span>
              <span className="text-label-sm text-on-surface-variant">Số lượt bóc tách tối đa mỗi 24 giờ</span>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  min={0}
                  max={1000}
                  required
                  disabled={!canEdit}
                  value={s.extraction_daily_limit_free}
                  onChange={(e) => setDraft({ ...s, extraction_daily_limit_free: Number(e.target.value) })}
                  className={`${adminFieldClass} w-28 font-mono`}
                />
                <span className="text-body-sm text-outline">lượt / ngày</span>
              </div>
            </label>

            <label className="flex flex-col gap-1.5 p-3 rounded-xl bg-surface-container-low border border-surface-container-high">
              <span className="font-semibold text-body-sm">Tài khoản Premium (Pro)</span>
              <span className="text-label-sm text-on-surface-variant">Số lượt bóc tách ưu tiên mỗi 24 giờ</span>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  min={0}
                  max={1000}
                  required
                  disabled={!canEdit}
                  value={s.extraction_daily_limit_premium}
                  onChange={(e) => setDraft({ ...s, extraction_daily_limit_premium: Number(e.target.value) })}
                  className={`${adminFieldClass} w-28 font-mono`}
                />
                <span className="text-body-sm text-outline">lượt / ngày</span>
              </div>
            </label>
          </div>
        </AdminDetailCard>

        {/* Card 2: Thông báo phát thanh toàn hệ thống */}
        <AdminDetailCard
          title="Thông báo toàn hệ thống"
          icon="campaign"
          description="Banner nổi bật hiển thị ở đầu trang của toàn bộ học viên khi đăng nhập (để trống để tắt thông báo)."
        >
          <div className="flex flex-col gap-2">
            <textarea
              maxLength={300}
              rows={3}
              disabled={!canEdit}
              placeholder="Nhập thông báo bảo trì, tính năng mới hoặc thông điệp gửi học viên..."
              value={s.announcement}
              onChange={(e) => setDraft({ ...s, announcement: e.target.value })}
              className={`${adminFieldClass} w-full resize-none`}
            />
            <div className="flex items-center justify-between text-label-sm text-outline">
              <span>{s.announcement.trim() ? "Đang có thông báo hoạt động" : "Chưa có thông báo"}</span>
              <span className="font-mono">{s.announcement.length} / 300</span>
            </div>

            {s.announcement.trim() && (
              <div className="mt-2 p-3 rounded-xl bg-primary-container/10 border border-primary-container/20">
                <div className="text-label-sm font-semibold text-primary mb-1 flex items-center gap-1">
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">visibility</span>
                  <span>Xem trước hiển thị phía học viên:</span>
                </div>
                <div className="p-2.5 rounded-lg bg-primary-container text-on-primary text-body-sm flex items-center gap-2">
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px] shrink-0 text-secondary-container">
                    campaign
                  </span>
                  <span className="break-words">{s.announcement}</span>
                </div>
              </div>
            )}
          </div>
        </AdminDetailCard>

        {/* Card 3: Chính sách truy cập */}
        <AdminDetailCard
          title="Chính sách truy cập & Đăng ký"
          icon="security"
          description="Kiểm soát khả năng mở tài khoản mới của công chúng."
        >
          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between gap-4 p-3 rounded-xl bg-surface-container-low border border-surface-container-high cursor-pointer">
              <div>
                <div className="font-semibold text-body-sm">Mở đăng ký tài khoản mới</div>
                <div className="text-label-sm text-on-surface-variant">Cho phép khách vãng lai tự đăng ký tài khoản học viên qua form /register</div>
              </div>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={s.registration_open}
                onChange={(e) => setDraft({ ...s, registration_open: e.target.checked })}
                className="w-5 h-5 text-primary rounded"
              />
            </label>

            {!s.registration_open && (
              <div className="p-space-sm rounded-xl bg-error/10 border border-error/20 text-error text-body-sm flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">lock</span>
                <span>Đăng ký mới đang bị đóng. Mọi lượt submit form đăng ký sẽ nhận thông báo hệ thống tạm ngừng tiếp nhận.</span>
              </div>
            )}
          </div>
        </AdminDetailCard>

        {canEdit && (
          <div className="flex items-center justify-between gap-3 p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-xs">
            <span className="text-body-sm text-on-surface-variant">
              {dirty ? "Có thay đổi chưa lưu" : "Dữ liệu đang đồng bộ với cơ sở dữ liệu"}
            </span>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={saving}
              disabled={!dirty}
            >
              Lưu thay đổi
            </Button>
          </div>
        )}
      </form>
    </section>
  );
};

export default AdminSettingsPage;
