import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { fetchAdminHealth, fetchAdminStats } from "@/services/adminService";
import { StatCard } from "@/features/admin/components/StatCard";
import { formatShort, periodDelta } from "@/features/admin/adminUtils";
import {
  aiEngineRows,
  engineHealthList,
  enrichSummary,
  ocrChartRows,
  queueCounts,
} from "@/features/admin/moderationUtils";
import { AdminTrendChart } from "@/features/admin/components/AdminTrendChart";
import { AdminOcrChart } from "@/features/admin/components/AdminOcrChart";
import { AdminAiPerformance } from "@/features/admin/components/AdminAiPerformance";
import { AdminBreakdown } from "@/features/admin/components/AdminBreakdown";
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";

const Dot: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <span className="inline-flex items-center gap-1 text-body-sm">
    <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-secondary" : "bg-error"}`} />
    {label} {ok ? "ok" : "down"}
  </span>
);

/** Thẻ hàng đợi kiểm duyệt: số > 0 tô cảnh báo, chân thẻ là link tới trang xử lý. */
const QueueCard: React.FC<{ label: string; value: number; icon: string; to: string; linkText: string }> = ({
  label,
  value,
  icon,
  to,
  linkText,
}) => (
  <StatCard
    label={label}
    value={value}
    icon={icon}
    tone={value > 0 ? "warn" : "default"}
    sub={
      <Link to={to} className="underline font-semibold">
        {linkText}
      </Link>
    }
  />
);

export const AdminDashboardPage: React.FC = () => {
  const [days, setDays] = useState(30);
  const [refresh, setRefresh] = useState(0);
  const stats = useAsync(() => fetchAdminStats(days), [days, refresh]);
  const health = useAsync(fetchAdminHealth, [refresh]);
  const s = stats.data;

  const userDelta = s && days >= 14 ? periodDelta(s.series, "newUsers") : null;
  const extDelta = s && days >= 14 ? periodDelta(s.series, "extractions") : null;

  // Hợp đồng đợt 2 (§4, §6, §1.3, §8): mọi trường mới đều tuỳ chọn — backend cũ thiếu thì phần tương ứng tự ẩn.
  const queues = queueCounts(s);
  const hasQueues = queues.pendingMnemonics !== null || queues.openAppeals !== null || queues.openQuestionFlags !== null;
  const engineRows = aiEngineRows(s?.ai?.engines);
  const enrich = enrichSummary(s?.ai?.enrich);
  // Cờ thành phần có thể nằm ở /admin/health hoặc trong stats.health (hợp đồng §8 ghi "health.engines").
  const engineFlags = engineHealthList(health.data?.engines ?? s?.health?.engines);
  const ocrRows = ocrChartRows(s?.ocrSeries);
  const showAi = engineRows.length > 0 || enrich !== null || engineFlags.length > 0;
  const enginesDown = engineFlags.filter((e) => !e.ok).length;

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <AdminPageHeader
        title="Tổng quan hệ thống"
        description="Số liệu tính trực tiếp từ cơ sở dữ liệu."
        actions={
          <>
            {health.data && (
              <>
                <Dot ok={health.data.db === "ok"} label="DB" />
                <Dot ok={health.data.aiService === "ok"} label="AI" />
                {engineFlags.length > 0 && (
                  <a
                    href="#admin-ai-perf-title"
                    className={`inline-flex items-center gap-1 text-body-sm hover:underline ${enginesDown > 0 ? "text-error font-semibold" : ""}`}
                  >
                    <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${enginesDown > 0 ? "bg-error" : "bg-secondary"}`} />
                    Thành phần AI {engineFlags.length - enginesDown}/{engineFlags.length}
                  </a>
                )}
                {health.data.backup !== "unmonitored" && (
                  <span
                    className={`inline-flex items-center gap-1 text-body-sm ${health.data.backup === "ok" ? "" : "text-error font-semibold"}`}
                    title={health.data.lastBackupAt ? `Sao lưu gần nhất ${formatShort(health.data.lastBackupAt)}` : "Chưa có bản sao lưu nào"}
                  >
                    <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${health.data.backup === "ok" ? "bg-secondary" : "bg-error"}`} />
                    Sao lưu {health.data.backup === "ok" ? "ok" : health.data.backup === "stale" ? "quá 48 giờ" : "chưa có"}
                  </span>
                )}
                <span className="text-label-sm text-outline">v{health.data.version}</span>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => setRefresh((n) => n + 1)} isLoading={stats.loading}>
              Tải lại
            </Button>
          </>
        }
      />

      {stats.error && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          {stats.error}
        </p>
      )}

      {s && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
            <StatCard
              label="Người dùng"
              value={s.users.total}
              icon="group"
              delta={userDelta && userDelta.pct !== null ? { value: userDelta.pct, label: "Tăng trưởng so với 7 ngày trước" } : null}
              sub={`+${s.users.new7d} / 7 ngày · ${s.users.locked} khoá · ${s.users.premium} Pro`}
            />
            <StatCard
              label="Hoạt động 7 ngày"
              value={s.users.active7d}
              icon="bolt"
              tone="success"
              sub="có ít nhất một lượt ôn"
            />
            <StatCard
              label="Bộ thẻ"
              value={s.decks.total}
              icon="style"
              sub={`${s.decks.public} public · ${s.decks.official} official`}
            />
            <StatCard
              label="Thẻ"
              value={s.cards}
              icon="view_carousel"
            />
            <StatCard
              label="Bóc tách"
              value={s.extractions.total}
              icon="psychology"
              delta={extDelta && extDelta.pct !== null ? { value: extDelta.pct, label: "Biến động so với 7 ngày trước" } : null}
              sub={`${s.extractions.failed} FAILED · ${s.extractions.running} đang chạy`}
            />
            {s.users.staffPendingSetup > 0 && (
              <StatCard
                label="Staff chưa bảo mật"
                value={s.users.staffPendingSetup}
                icon="shield_person"
                tone="warn"
                sub={
                  <Link to="/admin/users?role=STAFF" className="underline font-semibold">
                    chưa đổi mật khẩu mặc định
                  </Link>
                }
              />
            )}
            <StatCard
              label="Báo cáo mở"
              value={s.openReports}
              icon="flag"
              tone={s.openReports > 0 ? "warn" : "default"}
              sub={
                <Link to="/admin/reports" className="underline font-semibold">
                  xem hàng đợi
                </Link>
              }
            />
          </div>

          {hasQueues && (
            <section aria-labelledby="admin-queues-title" className="flex flex-col gap-2">
              <h2 id="admin-queues-title" className="text-label-sm uppercase tracking-wider text-outline font-bold px-1">
                Hàng đợi kiểm duyệt
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {queues.pendingMnemonics !== null && (
                  <QueueCard
                    label="Mẹo nhớ chờ duyệt"
                    value={queues.pendingMnemonics}
                    icon="lightbulb"
                    to="/admin/mnemonics"
                    linkText="duyệt mẹo nhớ"
                  />
                )}
                {queues.openAppeals !== null && (
                  <QueueCard
                    label="Khiếu nại mở"
                    value={queues.openAppeals}
                    icon="gavel"
                    to="/admin/appeals"
                    linkText="xử lý khiếu nại"
                  />
                )}
                {queues.openQuestionFlags !== null && (
                  <QueueCard
                    label="Câu hỏi bị báo lỗi"
                    value={queues.openQuestionFlags}
                    icon="quiz"
                    to="/admin/questions?flagged=true"
                    linkText="xem ngân hàng câu hỏi"
                  />
                )}
              </div>
            </section>
          )}

          <AdminTrendChart
            series={s.series}
            days={days}
            onDaysChange={setDays}
            isLoading={stats.loading}
          />

          {ocrRows.length > 0 && <AdminOcrChart rows={ocrRows} days={days} isLoading={stats.loading} />}

          {showAi && <AdminAiPerformance engines={engineRows} enrich={enrich} health={engineFlags} />}

          <AdminBreakdown stats={s} />

          <p className="text-label-sm text-outline px-1">
            {s.quizAttempts.toLocaleString("vi-VN")} lượt quiz · {s.learningPaths.toLocaleString("vi-VN")} lộ trình học tập
          </p>
        </>
      )}
    </section>
  );
};


export default AdminDashboardPage;
