import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { fetchAdminHealth, fetchAdminStats } from "@/services/adminService";
import { StatCard } from "@/features/admin/components/StatCard";
import { formatShort, periodDelta } from "@/features/admin/adminUtils";
import { AdminTrendChart } from "@/features/admin/components/AdminTrendChart";
import { AdminBreakdown } from "@/features/admin/components/AdminBreakdown";
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";

const Dot: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <span className="inline-flex items-center gap-1 text-body-sm">
    <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-secondary" : "bg-error"}`} />
    {label} {ok ? "ok" : "down"}
  </span>
);

export const AdminDashboardPage: React.FC = () => {
  const [days, setDays] = useState(30);
  const [refresh, setRefresh] = useState(0);
  const stats = useAsync(() => fetchAdminStats(days), [days, refresh]);
  const health = useAsync(fetchAdminHealth, [refresh]);
  const s = stats.data;

  const userDelta = s && days >= 14 ? periodDelta(s.series, "newUsers") : null;
  const extDelta = s && days >= 14 ? periodDelta(s.series, "extractions") : null;

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
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
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
                  <Link to="/admin/users?role=ADMIN" className="underline font-semibold">
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

          <AdminTrendChart
            series={s.series}
            days={days}
            onDaysChange={setDays}
            isLoading={stats.loading}
          />

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
