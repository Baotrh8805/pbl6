import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { atLeast } from "@/lib/roles";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchSettings, updateSettings } from "@/services/adminService";
import type { AdminSettings } from "@/types/api.types";
import { formatShort } from "@/features/admin/adminUtils";

const INPUT = "rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-body-sm disabled:opacity-60";

export const AdminSettingsPage: React.FC = () => {
  const { userProfile } = useAuth();
  const canEdit = atLeast(userProfile?.role, "SUPER_ADMIN");
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useAsync(fetchSettings, [reload]);
  const [draft, setDraft] = useState<AdminSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  if (loading) return <p className="text-on-surface-variant">Đang tải...</p>;
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

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl max-w-2xl">
      <div>
        <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">Cấu hình hệ thống</h1>
        <p className="text-body-sm text-on-surface-variant mt-0.5">
          Có hiệu lực ngay, không cần khởi động lại. Cập nhật lần cuối: {formatShort(data.updatedAt)}.
        </p>
      </div>
      <form
        className="rounded-2xl border border-surface-container-high bg-surface-container-lowest divide-y divide-surface-container-high"
        onSubmit={async (e) => {
          e.preventDefault();
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
            setStatus({ ok: true, text: "Đã lưu cấu hình." });
            setReload((n) => n + 1);
          } catch (err) {
            setStatus({ ok: false, text: extractErrorMessage(err) });
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="p-space-md flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">Lượt bóc tách / ngày · Free</span>
          <input
            type="number"
            min={0}
            max={1000}
            required
            disabled={!canEdit}
            value={s.extraction_daily_limit_free}
            onChange={(e) => setDraft({ ...s, extraction_daily_limit_free: Number(e.target.value) })}
            className={`${INPUT} w-28`}
          />
        </label>
        <label className="p-space-md flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">Lượt bóc tách / ngày · Premium</span>
          <input
            type="number"
            min={0}
            max={1000}
            required
            disabled={!canEdit}
            value={s.extraction_daily_limit_premium}
            onChange={(e) => setDraft({ ...s, extraction_daily_limit_premium: Number(e.target.value) })}
            className={`${INPUT} w-28`}
          />
        </label>
        <label className="p-space-md flex flex-col gap-1">
          <span className="font-semibold">Thông báo toàn hệ thống</span>
          <span className="text-body-sm text-on-surface-variant">Hiện ở đầu trang của người học; để trống = tắt. Tối đa 300 ký tự.</span>
          <textarea
            maxLength={300}
            rows={2}
            disabled={!canEdit}
            value={s.announcement}
            onChange={(e) => setDraft({ ...s, announcement: e.target.value })}
            className={INPUT}
          />
          <span className="text-label-sm text-outline text-right">{s.announcement.length}/300</span>
        </label>
        <label className="p-space-md flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">Mở đăng ký tài khoản mới</span>
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={s.registration_open}
            onChange={(e) => setDraft({ ...s, registration_open: e.target.checked })}
          />
        </label>
        <div className="p-space-md flex items-center justify-between gap-2">
          <span aria-live="polite" className={`text-body-sm ${status?.ok ? "text-secondary" : "text-error"}`}>
            {status?.text ?? (!canEdit ? "Chỉ Super admin được sửa." : "")}
          </span>
          {canEdit && (
            <Button type="submit" variant="primary" size="sm" isLoading={saving} disabled={!dirty}>
              Lưu thay đổi
            </Button>
          )}
        </div>
      </form>
    </section>
  );
};

export default AdminSettingsPage;
