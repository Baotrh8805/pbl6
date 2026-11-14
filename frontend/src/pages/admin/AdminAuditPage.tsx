import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { fetchAuditLogs } from "@/services/adminService";
import { AdminTableShell } from "@/features/admin/components/AdminTableShell";
import { Pager } from "@/features/admin/components/Pager";
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";
import { AdminFilterBar, adminFieldClass, adminLabelClass } from "@/features/admin/components/AdminFilterBar";
import { AdminStatusBadge } from "@/features/admin/components/AdminStatusBadge";
import { AdminJsonViewer } from "@/features/admin/components/AdminJsonViewer";
import { useAdminQuery } from "@/features/admin/useAdminQuery";
import {
  AUDIT_DATE_MAX,
  AUDIT_DATE_MIN,
  AUDIT_RANGE_ERROR,
  AUDIT_TARGET_LABELS,
  auditDateBlur,
  auditDateError,
  auditDateErrors,
  auditFilterError,
  formatShort,
  lastDaysRange,
  type AuditDateErrors,
} from "@/features/admin/adminUtils";
import { BreakableEmail } from "@/features/admin/components/BreakableEmail";

const PAGE_SIZE = 50;

export const AdminAuditPage: React.FC = () => {
  const q = useAdminQuery();
  const [actor, setActor] = useState(q.get("actorId"));
  const [actorError, setActorError] = useState<string | null>(null);
  // Ô ngày gõ dở: value "" nên chỉ đọc được qua validity của chính ô (ref), kiểm khi bấm Lọc.
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const [dateErrors, setDateErrors] = useState<AuditDateErrors>({ from: null, to: null });
  // Ngày đang gõ chỉ nằm trong ô: Chrome ghi value ngay khi ô năm mới có một chữ số (0002-10-01…), ghi thẳng lên URL thì
  // mỗi phím một request và banner "Bộ lọc chưa hợp lệ" nháy. Lên URL khi bấm Lọc, hoặc khi rời ô với ngày đã gõ xong.
  const [fromDraft, setFromDraft] = useState(q.get("from"));
  const [toDraft, setToDraft] = useState(q.get("to"));
  // URL đổi từ nơi khác (Back / Forward, link): đưa ô về đúng bộ lọc đang áp — chỉnh state ngay lúc render khi URL đổi,
  // không cần effect. Chỉ ô có mốc vừa đổi: rời "Từ ngày" ghi URL không được xoá ngày đang gõ dở ở "Đến ngày". Lời báo của
  // ô vừa đổi (và lời báo khoảng ngược, nói về cả hai ô) cũng hết: không để "Ngày bắt đầu phải trước…" treo cạnh hai ngày
  // đã hợp lệ sau khi bấm Back.
  const [appliedRange, setAppliedRange] = useState({ from: q.get("from"), to: q.get("to") });
  if (appliedRange.from !== q.get("from") || appliedRange.to !== q.get("to")) {
    const fromChanged = appliedRange.from !== q.get("from");
    const toChanged = appliedRange.to !== q.get("to");
    if (fromChanged) setFromDraft(q.get("from"));
    if (toChanged) setToDraft(q.get("to"));
    setDateErrors((e) => ({
      from: fromChanged ? null : e.from,
      to: toChanged || e.to === AUDIT_RANGE_ERROR ? null : e.to,
    }));
    setAppliedRange({ from: q.get("from"), to: q.get("to") });
  }
  const [retry, setRetry] = useState(0);
  // Bộ lọc trên URL sai (ID không phải số, từ ngày > đến ngày — kể cả link gõ tay): không gửi lên server (400 / 0 dòng
  // không rõ lý do), báo ngay câu sửa thế nào.
  const filterError = auditFilterError({ actorId: q.get("actorId"), from: q.get("from"), to: q.get("to") });
  const { data, loading, error } = useAsync(
    () =>
      filterError
        ? Promise.resolve(null)
        : fetchAuditLogs({
            actorId: q.get("actorId"),
            targetType: q.get("targetType"),
            from: q.get("from"),
            to: q.get("to"),
            page: q.page,
            size: PAGE_SIZE,
          }),
    [q.key, retry]
  );
  const rows = data?.items ?? [];

  // Ngày lịch theo giờ máy (lastDaysRange), không cắt từ toISOString: sáng sớm ở Việt Nam ngày UTC vẫn là hôm qua.
  const handleLast7Days = () => {
    const range = lastDaysRange(7);
    setFromDraft(range.from);
    setToDraft(range.to);
    q.set(range);
  };

  // Đã báo lỗi (sau khi bấm Lọc / rời ô): gõ tiếp thì kiểm lại cả hai ô để lời báo không treo khi đã sửa đúng.
  const recheckDates = () => {
    if (dateErrors.from || dateErrors.to) setDateErrors(auditDateErrors(fromRef.current, toRef.current));
  };

  const handleDateBlur = (key: "from" | "to") => {
    const inputs = { from: fromRef.current, to: toRef.current };
    const { errors, apply } = auditDateBlur(key, inputs, dateErrors, { from: q.get("from"), to: q.get("to") });
    setDateErrors(errors);
    if (apply) q.set(apply);
  };

  // Bấm chuột vào Lọc / 7 ngày / Đặt lại khi đang ở ô ngày: mousedown kéo focus khỏi ô -> blur ghi URL một lần, rồi click ghi
  // lần nữa (hai mục lịch sử, mục giữa là bộ lọc nửa vời: ngày mới + ID cũ). Giữ focus ở ô: chỉ click ghi, một lần.
  const keepFieldFocus = (e: React.MouseEvent) => e.preventDefault();

  // Picker của ô chỉ giới hạn theo ngày bên kia khi ngày đó đã gõ xong (min="0002-10-01" làm lịch nhảy về năm 2).
  const fromMax = toDraft && !auditDateError(toDraft) ? toDraft : AUDIT_DATE_MAX;
  const toMin = fromDraft && !auditDateError(fromDraft) ? fromDraft : AUDIT_DATE_MIN;

  // Nút đặt ngày (7 ngày / Đặt lại): ô gõ dở có value "" — nếu giá trị mới cũng là "" React không ghi lại DOM và phần gõ
  // dở còn nguyên, nên xoá tay trước; lời báo ngày chưa đủ cũng hết đúng.
  const clearPartialDates = () => {
    for (const el of [fromRef.current, toRef.current]) if (el?.validity.badInput) el.value = "";
    setDateErrors({ from: null, to: null });
  };

  const hasFilters = Boolean(q.get("actorId") || q.get("targetType") || q.get("from") || q.get("to"));

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <AdminPageHeader
        title="Nhật ký quản trị"
        description="Toàn bộ thao tác ghi của đội ngũ Staff; lưu trữ an toàn, chỉ đọc, không thể chỉnh sửa."
      />

      <AdminFilterBar
        onSubmit={(e) => {
          e.preventDefault();
          const invalid = auditFilterError({ actorId: actor, from: "", to: "" });
          // Ô ngày gõ dở: không chặn thì lọc "thành công" mà bỏ điều kiện ngày, người xem tưởng đã lọc theo ngày. Năm chưa gõ
          // xong / khoảng ngược cũng báo ngay cạnh ô thay vì đưa lên URL rồi hiện banner.
          const dates = auditDateErrors(fromRef.current, toRef.current);
          setActorError(invalid);
          setDateErrors(dates);
          if (!invalid && !dates.from && !dates.to) q.set({ actorId: actor.trim(), from: fromDraft, to: toDraft });
        }}
      >
        <label className={adminLabelClass}>
          ID người thao tác
          <input
            value={actor}
            onChange={(e) => {
              setActor(e.target.value);
              if (actorError) setActorError(auditFilterError({ actorId: e.target.value, from: "", to: "" }));
            }}
            // inputMode đủ để điện thoại mở bàn phím số; không đặt pattern — kiểm bằng auditFilterError (lời báo tiếng Việt)
            inputMode="numeric"
            placeholder="Ví dụ: 1"
            aria-invalid={!!actorError}
            aria-describedby={actorError ? "audit-actor-error" : undefined}
            className={`${adminFieldClass} w-32`}
          />
          {actorError && (
            <span id="audit-actor-error" role="alert" className="text-label-sm text-error font-normal normal-case max-w-[12rem]">
              {actorError}
            </span>
          )}
        </label>
        <label className={adminLabelClass}>
          Đối tượng
          <select
            value={q.get("targetType")}
            onChange={(e) => q.set({ targetType: e.target.value })}
            className={adminFieldClass}
          >
            <option value="">Tất cả</option>
            {Object.entries(AUDIT_TARGET_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={adminLabelClass}>
          Từ ngày
          <input
            ref={fromRef}
            type="date"
            value={fromDraft}
            min={AUDIT_DATE_MIN}
            max={fromMax}
            onChange={(e) => {
              setFromDraft(e.target.value);
              recheckDates();
            }}
            // Xoá hết các phần đang gõ không phát sự kiện change (value vẫn ""): rời ô thì kiểm lại để lời báo không treo.
            onBlur={() => handleDateBlur("from")}
            aria-invalid={!!dateErrors.from}
            aria-describedby={dateErrors.from ? "audit-from-error" : undefined}
            className={adminFieldClass}
          />
          {dateErrors.from && (
            <span id="audit-from-error" role="alert" className="text-label-sm text-error font-normal normal-case max-w-[12rem]">
              {dateErrors.from}
            </span>
          )}
        </label>
        <label className={adminLabelClass}>
          Đến ngày
          <input
            ref={toRef}
            type="date"
            value={toDraft}
            min={toMin}
            max={AUDIT_DATE_MAX}
            onChange={(e) => {
              setToDraft(e.target.value);
              recheckDates();
            }}
            onBlur={() => handleDateBlur("to")}
            aria-invalid={!!dateErrors.to}
            aria-describedby={dateErrors.to ? "audit-to-error" : undefined}
            className={adminFieldClass}
          />
          {dateErrors.to && (
            <span id="audit-to-error" role="alert" className="text-label-sm text-error font-normal normal-case max-w-[12rem]">
              {dateErrors.to}
            </span>
          )}
        </label>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm" onMouseDown={keepFieldFocus}>
            Lọc
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onMouseDown={keepFieldFocus}
            onClick={() => {
              clearPartialDates();
              handleLast7Days();
            }}
          >
            7 ngày gần nhất
          </Button>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onMouseDown={keepFieldFocus}
              onClick={() => {
                setActor("");
                setActorError(null);
                clearPartialDates();
                setFromDraft("");
                setToDraft("");
                q.set({ actorId: undefined, targetType: undefined, from: undefined, to: undefined });
              }}
            >
              Đặt lại
            </Button>
          )}
        </div>
      </AdminFilterBar>

      {filterError && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          Bộ lọc chưa hợp lệ: {filterError}
        </p>
      )}

      {!filterError && (
        <AdminTableShell
          caption="Nhật ký quản trị"
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyText="Chưa ghi nhận thao tác quản trị nào trong khoảng thời gian này."
          onRetry={() => setRetry((n) => n + 1)}
          statusText={data ? `${data.total.toLocaleString("vi-VN")} bản ghi` : undefined}
        >
          <thead>
            <tr>
              <th scope="col" className="w-36">Thời điểm</th>
              <th scope="col">Người thực hiện</th>
              <th scope="col">Hành động</th>
              <th scope="col">Đối tượng</th>
              <th scope="col">Chi tiết thay đổi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="hover:bg-surface-container-low/40 transition-colors">
                <td className="whitespace-nowrap text-on-surface-variant text-label-sm">
                  {formatShort(l.createdAt)}
                </td>
                <td className="font-semibold text-on-surface break-words min-w-[8rem]">
                  <BreakableEmail email={l.actorEmail} />
                </td>
                <td>
                  <AdminStatusBadge label={l.action} tone="info" />
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-on-surface">{AUDIT_TARGET_LABELS[l.targetType] ?? l.targetType}</span>
                    <span className="font-mono text-outline text-label-sm">#{l.targetId}</span>
                  </div>
                </td>
                <td className="max-w-md">
                  {/* Tóm tắt hẹp hơn dưới 2xl: bảng 5 cột vừa khung ~960 px ở 1280 px, nút Sao chép / mở rộng không phải cuộn ngang mới thấy */}
                  <AdminJsonViewer data={l.detail} summaryClassName="max-w-[11rem] 2xl:max-w-md" />
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTableShell>
      )}
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={q.setPage} />}
    </section>
  );
};

export default AdminAuditPage;
