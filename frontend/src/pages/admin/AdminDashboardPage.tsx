import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { fetchAdminHealth, fetchAdminStats } from "@/services/adminService";
import { StatCard } from "@/features/admin/components/StatCard";
import { BarSeries } from "@/features/admin/components/BarSeries";

type SeriesKey = "newUsers" | "extractions" | "quizzes";
const SERIES_LABELS: Record<SeriesKey, string> = { newUsers: "Đăng ký mới", extractions: "Bóc tách", quizzes: "Lượt quiz" };

const Dot: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <span className="inline-flex items-center gap-1 text-body-sm">
    <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-secondary" : "bg-error"}`} />
    {label} {ok ? "ok" : "down"}
  </span>
);

export const AdminDashboardPage: React.FC = () => {
  const [days, setDays] = useState(30);
  const [series, setSeries] = useState<SeriesKey>("newUsers");
  const [refresh, setRefresh] = useState(0);
  const stats = useAsync(() => fetchAdminStats(days), [days, refresh]);
  const health = useAsync(fetchAdminHealth, [refresh]);
  const s = stats.data;

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">Tổng quan hệ thống</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Số liệu tính trực tiếp từ cơ sở dữ liệu.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {health.data && (
            <>
              <Dot ok={health.data.db === "ok"} label="DB" />
              <Dot ok={health.data.aiService === "ok"} label="AI" />
              <span className="text-label-sm text-outline">v{health.data.version}</span>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setRefresh((n) => n + 1)} isLoading={stats.loading}>
            Tải lại
          </Button>
        </div>
      </div>

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
              sub={`+${s.users.new7d} / 7 ngày · ${s.users.locked} khoá · ${s.users.premium} Pro`}
            />
            <StatCard label="Hoạt động 7 ngày" value={s.users.active7d} sub="có ít nhất một lượt ôn" />
            <StatCard label="Bộ thẻ" value={s.decks.total} sub={`${s.decks.public} public · ${s.decks.official} official`} />
            <StatCard label="Thẻ" value={s.cards} />
            <StatCard
              label="Bóc tách"
              value={s.extractions.total}
              sub={`${s.extractions.failed} FAILED · ${s.extractions.running} đang chạy`}
            />
            <StatCard
              label="Báo cáo mở"
              value={s.openReports}
              tone={s.openReports > 0 ? "warn" : "default"}
              sub={
                <Link to="/admin/reports" className="underline font-semibold">
                  xem hàng đợi
                </Link>
              }
            />
          </div>

          <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-space-md flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1" role="tablist" aria-label="Chuỗi số liệu">
                {(Object.keys(SERIES_LABELS) as SeriesKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={series === k}
                    onClick={() => setSeries(k)}
                    className={`px-3 py-1.5 rounded-lg text-body-sm font-semibold cursor-pointer ${
                      series === k ? "bg-primary-container text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
                    }`}
                  >
                    {SERIES_LABELS[k]}
                  </button>
                ))}
              </div>
              <label className="text-body-sm text-on-surface-variant flex items-center gap-2">
                Số ngày
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1"
                >
                  {[7, 14, 30, 60, 90].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <BarSeries points={s.series.map((p) => ({ date: p.date, value: p[series] }))} label={SERIES_LABELS[series]} />
            <p className="text-label-sm text-outline">
              {s.quizAttempts.toLocaleString("vi-VN")} lượt quiz · {s.learningPaths.toLocaleString("vi-VN")} lộ trình học tập
            </p>
          </div>
        </>
      )}
    </section>
  );
};

export default AdminDashboardPage;
