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
  AUDIT_TARGET_LABELS,
  auditFilterError,
  formatShort,
  incompleteDateError,
  lastDaysRange,
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
  const [dateErrors, setDateErrors] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
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
  const handleLast7Days = () => q.set(lastDaysRange(7));

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
          // Ô ngày gõ dở: không chặn thì lọc "thành công" mà bỏ điều kiện ngày, người xem tưởng đã lọc theo ngày.
          const dates = { from: incompleteDateError(fromRef.current), to: incompleteDateError(toRef.current) };
          setActorError(invalid);
          setDateErrors(dates);
          if (!invalid && !dates.from && !dates.to) q.set({ actorId: actor.trim() });
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
            value={q.get("from")}
            max={q.get("to") || undefined}
            onChange={(e) => {
              if (dateErrors.from) setDateErrors((d) => ({ ...d, from: incompleteDateError(e.target) }));
              q.set({ from: e.target.value });
            }}
            // Xoá hết các phần đang gõ không phát sự kiện change (value vẫn ""): rời ô thì kiểm lại để lời báo không treo.
            onBlur={(e) => {
              if (dateErrors.from) setDateErrors((d) => ({ ...d, from: incompleteDateError(e.target) }));
            }}
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
            value={q.get("to")}
            min={q.get("from") || undefined}
            onChange={(e) => {
              if (dateErrors.to) setDateErrors((d) => ({ ...d, to: incompleteDateError(e.target) }));
              q.set({ to: e.target.value });
            }}
            onBlur={(e) => {
              if (dateErrors.to) setDateErrors((d) => ({ ...d, to: incompleteDateError(e.target) }));
            }}
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
          <Button type="submit" variant="primary" size="sm">
            Lọc
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
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
              onClick={() => {
                setActor("");
                setActorError(null);
                clearPartialDates();
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
