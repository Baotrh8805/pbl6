import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { apiErrorText } from "@/lib/apiErrorInfo";
import { buildAdminGraph, fetchAdminGraphStatus, syncAdminGraph } from "@/services/graphService";
import { formatShort } from "@/features/admin/adminUtils";

const COUNT_LABELS: [string, string][] = [
  ["Word", "từ"],
  ["Kanji", "chữ Hán"],
  ["Sentence", "câu ví dụ"],
  ["Grammar", "mẫu ngữ pháp"],
  ["HanViet", "âm Hán-Việt"],
  ["User", "người học"],
  ["Deck", "bộ thẻ"],
  ["Card", "thẻ"],
];

/** Admin > Tổng quan: trạng thái Neo4j, số node, nút dựng lại lớp tham chiếu / đồng bộ lớp người học (spec 2026-10-27 §9). */
export const AdminGraphCard: React.FC = () => {
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState<"build" | "sync" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const status = useAsync(fetchAdminGraphStatus, [], refresh);
  const ai = status.data?.ai;
  const working = Boolean(ai?.building || status.data?.syncing);

  useEffect(() => {
    if (!working) return;
    const t = window.setInterval(() => setRefresh((n) => n + 1), 5000);
    return () => window.clearInterval(t);
  }, [working]);

  const act = async (kind: "build" | "sync") => {
    setBusy(kind);
    setMsg(null);
    try {
      const r = kind === "build" ? await buildAdminGraph(true) : await syncAdminGraph();
      setMsg(r.started ? (kind === "build" ? "Đang dựng lại lớp tham chiếu (1–2 phút)." : "Đang đồng bộ toàn bộ người học.") : "Đang chạy dở, chờ xong rồi bấm lại.");
      setRefresh((n) => n + 1);
    } catch (e) {
      setMsg(apiErrorText(e) ?? "Không thực hiện được.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="p-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high flex flex-col gap-2" aria-labelledby="admin-graph-title">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 id="admin-graph-title" className="font-title-md text-title-md font-bold text-on-surface flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">
            hub
          </span>
          Đồ thị tri thức (Neo4j)
          {ai && (
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${ai.available ? (ai.built ? "bg-secondary-container text-on-secondary-container" : "bg-[#FEF3C7] text-[#B45309]") : "bg-error-container text-on-error-container"}`}>
              {!ai.available ? "Neo4j tắt" : ai.building ? `Đang dựng${ai.step ? ` (${ai.step})` : ""}` : ai.built ? "Sẵn sàng" : "Chưa dựng"}
            </span>
          )}
          {status.data?.syncing && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#FEF3C7] text-[#B45309]">Đang đồng bộ</span>}
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => act("build")} isLoading={busy === "build"} disabled={!ai?.available || working}>
            Dựng lại đồ thị
          </Button>
          <Button size="sm" variant="primary" onClick={() => act("sync")} isLoading={busy === "sync"} disabled={!ai?.available || !ai?.built || working}>
            Đồng bộ dữ liệu học
          </Button>
        </div>
      </div>
      {status.error && <p className="text-body-sm text-error">{status.error}</p>}
      {ai && !ai.available && (
        <p className="text-body-sm text-on-surface-variant">
          ai-service không nối được Neo4j. Chạy <code className="font-mono text-label-sm">docker compose up -d neo4j</code> (hoặc đặt NEO4J_URI / NEO4J_PASSWORD cho ai-service) rồi bấm «Dựng lại đồ thị».
        </p>
      )}
      {ai?.available && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-body-sm">
          {COUNT_LABELS.map(([key, label]) => (
            <div key={key} className="flex justify-between gap-2 border-b border-surface-container-high py-0.5">
              <dt className="text-outline">{label}</dt>
              <dd className="font-semibold text-on-surface tabular-nums">{(ai.counts?.[key] ?? 0).toLocaleString("vi-VN")}</dd>
            </div>
          ))}
        </dl>
      )}
      {ai?.available && (
        <p className="text-label-sm text-on-surface-variant">
          Lớp tham chiếu dựng lúc {ai.builtAt ? formatShort(ai.builtAt) : "chưa dựng"}
          {ai.buildSeconds ? ` (${Math.round(ai.buildSeconds)} giây${ai.withGrammar === false ? ", bỏ qua ngữ pháp" : ""})` : ""}
          {" · "}
          Lớp người học đồng bộ lúc {ai.learner?.syncedAt ? `${formatShort(ai.learner.syncedAt)} (${ai.learner.scope === "all" ? "toàn bộ" : "một người"})` : "chưa đồng bộ"}
          {status.data?.lastSync && ` · lần đồng bộ toàn bộ gần nhất của backend: ${formatShort(status.data.lastSync.at)}, ${status.data.lastSync.rows.cards ?? 0} thẻ trong ${Math.round(status.data.lastSync.millis / 1000)} giây`}
          {" · "}Job đêm 03:50.
        </p>
      )}
      {ai?.error && <p className="text-body-sm text-error">Lần dựng gần nhất lỗi: {ai.error}</p>}
      {status.data?.lastSyncError && <p className="text-body-sm text-error">Đồng bộ gần nhất lỗi: {status.data.lastSyncError}</p>}
      {msg && <p className="text-body-sm text-on-surface">{msg}</p>}
    </section>
  );
};
