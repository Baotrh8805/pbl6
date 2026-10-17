import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { atLeast } from "@/lib/roles";
import { extractErrorMessage } from "@/services/apiClient";
import { deleteAdminDeck, fetchAdminDeck, setDeckFlags, unpublishDeck } from "@/services/adminService";
import { CardContent } from "@/features/decks/components/CardContent";

export const AdminDeckDetailPage: React.FC = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const dialog = useDialog();
  const { userProfile } = useAuth();
  const canAct = atLeast(userProfile?.role, "ADMIN");
  const [reload, setReload] = useState(0);
  const { data: deck, loading, error } = useAsync(() => fetchAdminDeck(id), [id], reload);
  const [flags, setFlags] = useState<{ official: boolean; featured: boolean } | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  if (loading) return <p className="text-on-surface-variant">Đang tải...</p>;
  if (error || !deck) {
    return (
      <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
        {error ?? "Không tìm thấy bộ thẻ."}
      </p>
    );
  }
  const f = flags ?? { official: deck.official, featured: deck.featured };
  const dirty = f.official !== deck.official || f.featured !== deck.featured;

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <div>
        <Link to="/admin/decks" className="text-body-sm text-primary underline">
          ← Nội dung
        </Link>
        <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface mt-1">{deck.title}</h1>
        <p className="text-body-sm text-on-surface-variant mt-0.5">
          Chủ{" "}
          <Link to={`/admin/users/${deck.ownerId}`} className="underline">
            {deck.ownerEmail}
          </Link>{" "}
          · {deck.visibility} · {deck.level}
          {deck.category && ` · ${deck.category}`} · {deck.cardCount} thẻ · ★{deck.avgStars === null ? "—" : deck.avgStars.toFixed(1)} ·{" "}
          {deck.downloads} lượt tải
        </p>
        {deck.openReports > 0 && (
          <p className="text-body-sm font-bold text-error mt-1">
            ⚠ {deck.openReports} báo cáo đang mở ·{" "}
            <Link to={`/admin/reports?deckId=${encodeURIComponent(deck.id)}`} className="underline">
              xem
            </Link>
          </p>
        )}
      </div>

      {status && (
        <p role={status.ok ? "status" : "alert"} className={`text-body-sm ${status.ok ? "text-secondary" : "text-error"}`}>
          {status.text}
        </p>
      )}

      {canAct && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-surface-container-high bg-surface-container-lowest p-space-md">
          <Button
            variant="outline"
            size="sm"
            disabled={deck.visibility !== "public"}
            title={deck.visibility !== "public" ? "Bộ thẻ đã ở chế độ riêng tư" : undefined}
            onClick={async () => {
              const ok = await dialog.confirm({
                title: "Gỡ khỏi Thư viện?",
                message: `"${deck.title}" chuyển về riêng tư: chỉ chủ bộ thẻ còn thấy.`,
                confirmLabel: "Gỡ",
                tone: "warning",
                action: () => unpublishDeck(deck.id),
              });
              if (ok) setReload((n) => n + 1);
            }}
          >
            Gỡ khỏi Thư viện
          </Button>
          <form
            className="flex items-center gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await setDeckFlags(deck.id, f);
                setFlags(null);
                setStatus({ ok: true, text: "Đã lưu cờ." });
                setReload((n) => n + 1);
              } catch (err) {
                setStatus({ ok: false, text: extractErrorMessage(err) });
              }
            }}
          >
            <label className="flex items-center gap-1.5 text-body-sm">
              <input type="checkbox" checked={f.official} onChange={(e) => setFlags({ ...f, official: e.target.checked })} />
              Official
            </label>
            <label className="flex items-center gap-1.5 text-body-sm" title="Chỉ một bộ thẻ nổi bật; gắn mới sẽ bỏ cờ bộ cũ">
              <input type="checkbox" checked={f.featured} onChange={(e) => setFlags({ ...f, featured: e.target.checked })} />
              Featured
            </label>
            <Button type="submit" variant="outline" size="sm" disabled={!dirty}>
              Lưu
            </Button>
          </form>
          <Button
            variant="danger"
            size="sm"
            className="ml-auto"
            onClick={async () => {
              const ok = await dialog.confirm({
                title: "Xoá bộ thẻ?",
                message: `"${deck.title}" của ${deck.ownerEmail} và toàn bộ thẻ, đánh giá, lịch sử ôn liên quan sẽ bị xoá vĩnh viễn.`,
                confirmLabel: "Xoá vĩnh viễn",
                tone: "danger",
                action: () => deleteAdminDeck(deck.id),
              });
              if (ok) navigate("/admin/decks", { replace: true });
            }}
          >
            Xoá bộ thẻ
          </Button>
        </div>
      )}

      <div>
        <h2 className="font-semibold text-on-surface mb-2">Thẻ</h2>
        {deck.cards === null ? (
          <p className="p-4 rounded-2xl bg-surface-container-low text-body-sm text-on-surface-variant">
            Nội dung riêng tư, không hiển thị (chỉ xem được khi bộ thẻ public hoặc đang bị báo cáo).
          </p>
        ) : deck.cards.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">Bộ thẻ chưa có thẻ nào.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-surface-container-high bg-surface-container-lowest">
            <table className="w-full text-body-sm [&_th]:text-left [&_th]:px-3 [&_th]:py-2 [&_th]:text-label-sm [&_th]:uppercase [&_th]:text-outline [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_tbody_tr]:border-t [&_tbody_tr]:border-surface-container-high">
              <caption className="sr-only">Thẻ trong bộ {deck.title}</caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Từ</th>
                  <th scope="col">Cách đọc</th>
                  <th scope="col">Nghĩa</th>
                </tr>
              </thead>
              <tbody>
                {deck.cards.map((c, i) => (
                  <tr key={c.id}>
                    <td className="text-outline">{i + 1}</td>
                    <td className="font-semibold">{c.term}</td>
                    <td>{c.reading ?? ""}</td>
                    <td className="max-w-md">
                      <CardContent text={c.meaning} headClassName="font-medium text-on-surface" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

export default AdminDeckDetailPage;
