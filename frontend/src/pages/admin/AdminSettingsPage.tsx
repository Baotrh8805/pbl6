import React, { useId, useState } from "react";
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
import {
  AI_MODEL_MAX,
  AI_THRESHOLD_FIELDS,
  EXTRACTION_LIMIT_MAX,
  LEARNING_PATH_FIELDS,
  SETTINGS_NUMBER_FIELDS,
  buildSettingsPayload,
  hasAllExtras,
  isValidExtractionLimit,
  normalizeAdminSettings,
  parseSettingNumber,
  settingNumberError,
  type SettingsNumberField,
  type SettingsNumberKey,
} from "@/features/admin/settingsUtils";

export const AdminSettingsPage: React.FC = () => {
  const { userProfile } = useAuth();
  const canEdit = atLeast(userProfile?.role, "SUPER_ADMIN");
  const [reload, setReload] = useState(0);
  // normalize: khoá mới (G5) có thể chưa có ở backend cũ, hoặc được đặt tên camelCase -> xem settingsUtils.
  const { data, loading, error } = useAsync(async () => normalizeAdminSettings(await fetchSettings()), [reload]);
  const [draft, setDraft] = useState<AdminSettings | null>(null);
  // Ô số của khoá mới giữ nguyên chuỗi đang gõ ("0." / "0,8") — ép sang số mỗi lần gõ sẽ làm mất dấu thập phân.
  const [numText, setNumText] = useState<Partial<Record<SettingsNumberKey, string>>>({});
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
  const base = data.settings;
  const s = draft ?? base;
  // Backend chưa trả đủ khoá mới: hiện "—", khoá ô nhập, PUT chỉ gửi 4 khoá cũ (buildSettingsPayload).
  const extrasReady = hasAllExtras(base);
  const textOf = (f: SettingsNumberField) => numText[f.key] ?? (s[f.key] === undefined ? "" : String(s[f.key]));
  const numErrors: Partial<Record<SettingsNumberKey, string>> = {};
  const numValues: Partial<Record<SettingsNumberKey, number>> = {};
  if (extrasReady) {
    for (const f of SETTINGS_NUMBER_FIELDS) {
      const text = textOf(f);
      const err = settingNumberError(f, text);
      if (err) numErrors[f.key] = err;
      else numValues[f.key] = parseSettingNumber(f, text) ?? undefined;
    }
  }
  const limitError =
    !isValidExtractionLimit(s.extraction_daily_limit_free) || !isValidExtractionLimit(s.extraction_daily_limit_premium)
      ? `Hạn mức phải là số nguyên từ 0 đến ${EXTRACTION_LIMIT_MAX}.`
      : null;
  const modelError = (s.ai_model_primary ?? "").trim().length > AI_MODEL_MAX ? `Tối đa ${AI_MODEL_MAX} ký tự.` : null;
  const invalid = !!limitError || !!modelError || Object.keys(numErrors).length > 0;
  const merged: AdminSettings = { ...s, ...numValues };
  const dirty =
    s.extraction_daily_limit_free !== base.extraction_daily_limit_free ||
    s.extraction_daily_limit_premium !== base.extraction_daily_limit_premium ||
    s.announcement !== base.announcement ||
    s.registration_open !== base.registration_open ||
    (extrasReady &&
      (SETTINGS_NUMBER_FIELDS.some((f) => numValues[f.key] !== undefined && numValues[f.key] !== base[f.key]) ||
        (s.ai_model_primary ?? "").trim() !== (base.ai_model_primary ?? "") ||
        s.email_verification_required !== base.email_verification_required));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !dirty || invalid) return;
    setSaving(true);
    setStatus(null);
    try {
      await updateSettings(buildSettingsPayload(merged, data.camelExtras));
      setDraft(null);
      setNumText({});
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
        description={`Các thiết lập có hiệu lực ngay lập tức. Cập nhật lần cuối: ${formatShort(base.updatedAt)}`}
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
                disabled={!dirty || invalid}
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
          {limitError && (
            <p role="alert" className="text-label-sm text-error">
              {limitError}
            </p>
          )}
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

            {/* G5: khoá email_verification_required (thiếu ở backend cũ -> khoá công tắc, hiện "—"). */}
            <label
              className={`flex items-center justify-between gap-4 p-3 rounded-xl bg-surface-container-low border border-surface-container-high ${
                extrasReady ? "cursor-pointer" : ""
              }`}
            >
              <div>
                <div className="font-semibold text-body-sm">Bắt buộc xác thực email khi đăng ký</div>
                <div className="text-label-sm text-on-surface-variant">
                  Tài khoản mới phải bấm liên kết trong email xác thực trước khi đăng nhập được
                  {!extrasReady && " — máy chủ chưa hỗ trợ khoá này"}
                </div>
              </div>
              {extrasReady ? (
                <input
                  type="checkbox"
                  role="switch"
                  disabled={!canEdit}
                  checked={s.email_verification_required === true}
                  onChange={(e) => setDraft({ ...s, email_verification_required: e.target.checked })}
                  className="w-5 h-5 text-primary rounded"
                />
              ) : (
                <span className="text-body-sm text-outline font-mono" aria-label="Chưa có dữ liệu">—</span>
              )}
            </label>

            {!s.registration_open && (
              <div className="p-space-sm rounded-xl bg-error/10 border border-error/20 text-error text-body-sm flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">lock</span>
                <span>Đăng ký mới đang bị đóng. Mọi lượt submit form đăng ký sẽ nhận thông báo hệ thống tạm ngừng tiếp nhận.</span>
              </div>
            )}
          </div>
        </AdminDetailCard>

        {!extrasReady && (
          <p role="status" className="p-space-sm rounded-xl bg-surface-container-low border border-surface-container-high text-body-sm text-on-surface-variant flex items-start gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-outline shrink-0">info</span>
            <span>
              Máy chủ chưa trả các khoá “Tham số AI”, “Lộ trình học tập” và “Xác thực email” (cần backend bản mới). Các ô này chỉ
              hiển thị; lưu cấu hình vẫn chỉ gửi 4 khoá cũ nên không ảnh hưởng thiết lập hiện tại.
            </span>
          </p>
        )}

        {/* Card 4 (G5): tham số AI — ngưỡng 0..1 + model chính */}
        <AdminDetailCard
          title="Tham số AI"
          icon="tune"
          description="Ngưỡng độ tin cậy (0–1) điều khiển khi nào hệ thống nhờ AI đọc lại, cảnh báo hoặc dùng gợi ý của AI."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {AI_THRESHOLD_FIELDS.map((f) => (
              <SettingNumberInput
                key={f.key}
                field={f}
                value={textOf(f)}
                error={numErrors[f.key] ?? null}
                disabled={!canEdit || !extrasReady}
                onChange={(text) => setNumText((cur) => ({ ...cur, [f.key]: text }))}
              />
            ))}
            <label className="flex flex-col gap-1.5 p-3 rounded-xl bg-surface-container-low border border-surface-container-high sm:col-span-2">
              <span className="font-semibold text-body-sm">Model AI chính</span>
              <span className="text-label-sm text-on-surface-variant">
                Tên model Gemini dùng cho bóc tách / dịch nghĩa (vd. gemini-2.5-flash). Để trống = dùng cấu hình mặc định của ai-service.
              </span>
              <input
                type="text"
                maxLength={AI_MODEL_MAX}
                disabled={!canEdit || !extrasReady}
                value={s.ai_model_primary ?? ""}
                placeholder={extrasReady ? "Mặc định của ai-service" : "—"}
                onChange={(e) => setDraft({ ...s, ai_model_primary: e.target.value })}
                aria-invalid={modelError ? true : undefined}
                className={`${adminFieldClass} w-full sm:max-w-xs font-mono mt-1`}
              />
              {modelError && <span className="text-label-sm text-error">{modelError}</span>}
            </label>
          </div>
        </AdminDetailCard>

        {/* Card 5 (G5): mặc định của lộ trình học tập */}
        <AdminDetailCard
          title="Lộ trình học tập"
          icon="alt_route"
          description="Giá trị mặc định cho lộ trình của mọi người học (người học vẫn tự đổi trần tải và bật / tắt nhắc học)."
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {LEARNING_PATH_FIELDS.map((f) => (
              <SettingNumberInput
                key={f.key}
                field={f}
                value={textOf(f)}
                error={numErrors[f.key] ?? null}
                disabled={!canEdit || !extrasReady}
                onChange={(text) => setNumText((cur) => ({ ...cur, [f.key]: text }))}
              />
            ))}
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
              disabled={!dirty || invalid}
            >
              Lưu thay đổi
            </Button>
          </div>
        )}
      </form>
    </section>
  );
};

/** Ô số của một khoá cấu hình: nhãn, giải thích, khoảng hợp lệ, lỗi ngay dưới ô (aria-invalid / aria-describedby). */
const SettingNumberInput: React.FC<{
  field: SettingsNumberField;
  value: string;
  error: string | null;
  disabled: boolean;
  onChange: (text: string) => void;
}> = ({ field, value, error, disabled, onChange }) => {
  const errorId = useId();
  return (
    <label className="flex flex-col gap-1.5 p-3 rounded-xl bg-surface-container-low border border-surface-container-high">
      <span className="font-semibold text-body-sm">{field.label}</span>
      <span className="text-label-sm text-on-surface-variant">{field.hint}</span>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="number"
          inputMode={field.integer ? "numeric" : "decimal"}
          min={field.min}
          max={field.max}
          step={field.step}
          disabled={disabled}
          value={value}
          placeholder="—"
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${adminFieldClass} w-28 font-mono`}
        />
        <span className="text-body-sm text-outline">
          {field.unit ?? `${field.min}–${field.max}`}
        </span>
      </div>
      {error && (
        <span id={errorId} className="text-label-sm text-error">
          {error}
        </span>
      )}
    </label>
  );
};

export default AdminSettingsPage;
