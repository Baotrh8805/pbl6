import React, { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/dialogContext";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { atLeast } from "@/lib/roles";
import { extractErrorMessage } from "@/services/apiClient";
import { deleteAdminDeck, fetchAdminDeck, setDeckFlags, unpublishDeck } from "@/services/adminService";
import { CardContent } from "@/features/decks/components/CardContent";
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";
import { AdminStatusBadge } from "@/features/admin/components/AdminStatusBadge";
import { AdminDetailCard } from "@/features/admin/components/AdminDetailCard";
import { adminFieldClass } from "@/features/admin/components/AdminFilterBar";

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

  // Trạng thái cho bộ lật thẻ flashcard tương tác (Flashcard Flip Preview)
  const [previewOpen, setPreviewOpen] = useState(true);
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Trạng thái tìm kiếm thẻ trong bảng
  const [cardSearch, setCardSearch] = useState("");

  const cards = deck?.cards ?? [];

  // Lắng nghe phím mũi tên và Space khi widget lật thẻ đang mở
  useEffect(() => {
    if (!previewOpen || cards.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Tránh bắt phím khi đang gõ vào input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIsFlipped(false);
        setCardIndex((i) => (i + 1) % cards.length);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIsFlipped(false);
        setCardIndex((i) => (i - 1 + cards.length) % cards.length);
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setIsFlipped((f) => !f);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewOpen, cards.length]);

  if (loading) return <p className="text-on-surface-variant p-space-md">Đang tải chi tiết bộ thẻ...</p>;
  if (error || !deck) {
    return (
      <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
        {error ?? "Không tìm thấy bộ thẻ."}
      </p>
    );
  }
  const f = flags ?? { official: deck.official, featured: deck.featured };
  const dirty = f.official !== deck.official || f.featured !== deck.featured;
  // Nổi bật chỉ dành cho bộ public (backend chặn 400, gỡ / chuyển riêng tư tự bỏ cờ): bộ riêng tư không bật được,
  // nhưng vẫn cho bỏ nếu dữ liệu cũ còn sót cờ (DB không có CHECK). Khoá theo cờ đã lưu chứ không theo bản nháp:
  // lỡ bỏ tích thì tích lại được (backend coi "giữ nguyên cờ" là hợp lệ), không bị khoá cứng tới khi tải lại trang.
  const isPublic = deck.visibility === "public";
  const featureLocked = !isPublic && !deck.featured;
  const legacyFeatured = !isPublic && deck.featured;

  const currentCard = cards[cardIndex] ?? null;

  // Lọc danh sách thẻ học theo từ khoá
  const filteredCards = cards.filter((c) => {
    if (!cardSearch.trim()) return true;
    const q = cardSearch.trim().toLowerCase();
    return (
      c.term.toLowerCase().includes(q) ||
      (c.reading && c.reading.toLowerCase().includes(q)) ||
      c.meaning.toLowerCase().includes(q)
    );
  });

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <div>
        <Link to="/admin/decks" className="inline-flex items-center gap-1 text-body-sm text-primary hover:underline mb-1">
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Danh sách Nội dung</span>
        </Link>
        <AdminPageHeader
          title={deck.title}
          description={`Chủ sở hữu: ${deck.ownerEmail} · Cấp độ ${deck.level}${deck.category ? ` · ${deck.category}` : ""} · ${deck.cardCount} thẻ · ★ ${deck.avgStars === null ? "—" : deck.avgStars.toFixed(1)} · ${deck.downloads} lượt tải`}
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/decks/${encodeURIComponent(deck.id)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest hover:bg-surface-container text-body-sm font-semibold text-primary transition-all shadow-xs"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">open_in_new</span>
                <span>Xem trang học viên</span>
              </Link>
              <AdminStatusBadge
                label={deck.visibility === "public" ? "Công khai (Public)" : "Riêng tư (Private)"}
                tone={deck.visibility === "public" ? "info" : "neutral"}
              />
              {deck.official && <AdminStatusBadge label="Official" tone="success" icon="verified" />}
              {deck.featured && <AdminStatusBadge label="Featured" tone="warn" icon="grade" />}
            </div>
          }
        />
      </div>

      {deck.openReports > 0 && (
        <div className="p-space-md rounded-2xl bg-error/10 border border-error/30 flex items-center justify-between gap-3 text-body-sm text-error">
          <div className="flex items-center gap-2 font-semibold">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">flag</span>
            <span>Bộ thẻ này đang có {deck.openReports} báo cáo khiếu nại đang mở cần xử lý.</span>
          </div>
          <Link
            to={`/admin/reports?deckId=${encodeURIComponent(deck.id)}`}
            className="px-3 py-1.5 bg-error text-white rounded-lg font-semibold hover:bg-on-error-container transition-colors shrink-0"
          >
            Mở xem khiếu nại
          </Link>
        </div>
      )}

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

      {canAct && (
        <AdminDetailCard title="Hành động & Phê duyệt nội dung" icon="tune">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <form
              className="flex items-center gap-4 flex-wrap"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await setDeckFlags(deck.id, f);
                  setFlags(null);
                  setStatus({ ok: true, text: "Đã cập nhật trạng thái cờ Official / Featured." });
                  setReload((n) => n + 1);
                } catch (err) {
                  setStatus({ ok: false, text: extractErrorMessage(err) });
                }
              }}
            >
              <label className="flex items-center gap-2 text-body-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={f.official}
                  onChange={(e) => setFlags({ ...f, official: e.target.checked })}
                  className="w-4 h-4 text-primary rounded"
                />
                <span className="font-semibold">Bộ thẻ Official (Chính thức)</span>
              </label>
              <label
                className={`flex items-center gap-2 text-body-sm select-none ${featureLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                title={
                  featureLocked
                    ? "Chỉ bộ thẻ công khai mới gắn được Nổi bật"
                    : legacyFeatured
                      ? "Bộ riêng tư còn sót cờ Nổi bật từ dữ liệu cũ: chỉ bỏ được, bỏ rồi không gắn lại được"
                      : "Chỉ một bộ thẻ nổi bật; gắn mới sẽ thay thế bộ cũ"
                }
              >
                <input
                  type="checkbox"
                  checked={f.featured}
                  disabled={featureLocked}
                  onChange={(e) => setFlags({ ...f, featured: e.target.checked })}
                  className="w-4 h-4 text-primary rounded"
                />
                <span className="font-semibold">Bộ thẻ Featured (Nổi bật)</span>
              </label>
              <Button type="submit" variant="primary" size="sm" disabled={!dirty}>
                Lưu cờ
              </Button>
            </form>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                disabled={!isPublic}
                title={!isPublic ? "Bộ thẻ đã ở chế độ riêng tư" : undefined}
                onClick={async () => {
                  const ok = await dialog.confirm({
                    title: "Gỡ khỏi Thư viện công khai?",
                    message: `"${deck.title}" sẽ chuyển về chế độ riêng tư: chỉ tác giả (${deck.ownerEmail}) còn quyền truy cập.${
                      deck.featured ? " Cờ Nổi bật cũng được gỡ (bộ riêng tư không lên Thư viện)." : ""
                    }`,
                    confirmLabel: "Gỡ về riêng tư",
                    tone: "warning",
                    action: () => unpublishDeck(deck.id),
                  });
                  if (ok) {
                    setStatus({
                      ok: true,
                      text: deck.featured
                        ? "Đã gỡ bộ thẻ khỏi Thư viện, chuyển về chế độ riêng tư và bỏ cờ Nổi bật."
                        : "Đã gỡ bộ thẻ khỏi Thư viện, chuyển về chế độ riêng tư.",
                    });
                    // Bản nháp cờ (nếu đang sửa dở) dựa trên bộ public cũ: bỏ để ô Nổi bật theo đúng trạng thái mới.
                    setFlags(null);
                    setReload((n) => n + 1);
                  }
                }}
              >
                Gỡ khỏi Thư viện
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  const ok = await dialog.confirm({
                    title: "Xoá vĩnh viễn bộ thẻ?",
                    message: `"${deck.title}" của ${deck.ownerEmail} cùng toàn bộ thẻ từ vựng và lịch sử học liên quan sẽ bị xoá vĩnh viễn khỏi hệ thống.`,
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
          </div>
        </AdminDetailCard>
      )}

      {/* Widget xem trước lật thẻ flashcard tương tác (Quizlet / Anki style flip card) */}
      {cards.length > 0 && (
        <AdminDetailCard
          title="Trải nghiệm Flashcard tương tác (Flip Preview)"
          icon="flip_to_back"
          actions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPreviewOpen((o) => !o)}
            >
              {previewOpen ? "Thu gọn xem thử" : "Mở xem thử thẻ"}
            </Button>
          }
        >
          {previewOpen && currentCard && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="flex items-center justify-between w-full max-w-lg text-label-sm text-outline px-1">
                <span className="font-mono font-semibold">
                  Thẻ {cardIndex + 1} / {cards.length}
                </span>
                <span className="text-on-surface-variant text-[11px]">
                  Mẹo: Nhấn chuột hoặc phím Space để lật mặt · Phím ‹ › để chuyển thẻ
                </span>
              </div>

              {/* Thẻ 3D Flashcard */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setIsFlipped((f) => !f)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setIsFlipped((f) => !f);
                  }
                }}
                className="w-full max-w-lg h-60 rounded-2xl border-2 border-primary/20 bg-surface-container-lowest p-6 shadow-sm hover:shadow-md cursor-pointer transition-all duration-300 flex flex-col items-center justify-center text-center relative select-none group"
                style={{
                  transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                  transformStyle: "preserve-3d",
                  transition: "transform 0.35s ease-out",
                }}
                aria-label={`Thẻ số ${cardIndex + 1}: ${isFlipped ? currentCard.meaning : currentCard.term}`}
              >
                {/* Mặt trước: Kanji / Thuật ngữ */}
                <div
                  className="absolute inset-0 p-6 flex flex-col items-center justify-center"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  <div className="text-xs uppercase tracking-widest text-outline font-bold mb-2">Mặt trước (Term)</div>
                  <div className="text-3xl font-bold font-kanji text-primary tracking-wide">
                    {currentCard.term}
                  </div>
                  {currentCard.reading && (
                    <div className="text-lg font-kanji text-on-surface-variant mt-2 font-medium">
                      {currentCard.reading}
                    </div>
                  )}
                  <div className="absolute bottom-3 text-label-sm text-outline/80 flex items-center gap-1 group-hover:text-primary transition-colors">
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">touch_app</span>
                    <span>Nhấn để xem ý nghĩa</span>
                  </div>
                </div>

                {/* Mặt sau: Ý nghĩa / Giải nghĩa */}
                <div
                  className="absolute inset-0 p-6 flex flex-col items-center justify-center bg-primary-fixed/20 rounded-2xl"
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                  }}
                >
                  <div className="text-xs uppercase tracking-widest text-outline font-bold mb-2">Mặt sau (Meaning)</div>
                  <div className="text-base font-medium text-on-surface text-center max-w-sm">
                    <CardContent text={currentCard.meaning} headClassName="font-semibold text-primary" />
                  </div>
                  <div className="absolute bottom-3 text-label-sm text-outline/80 flex items-center gap-1 group-hover:text-primary transition-colors">
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">rotate_left</span>
                    <span>Nhấn để quay lại mặt trước</span>
                  </div>
                </div>
              </div>

              {/* Bộ điều khiển chuyển thẻ */}
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsFlipped(false);
                    setCardIndex((i) => (i - 1 + cards.length) % cards.length);
                  }}
                  title="Thẻ trước (Phím Mũi tên trái)"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">chevron_left</span>
                  <span>Trước</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsFlipped((f) => !f)}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">sync</span>
                  <span>Lật thẻ</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsFlipped(false);
                    setCardIndex((i) => (i + 1) % cards.length);
                  }}
                  title="Thẻ kế tiếp (Phím Mũi tên phải)"
                >
                  <span>Sau</span>
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">chevron_right</span>
                </Button>
              </div>
            </div>
          )}
        </AdminDetailCard>
      )}

      {/* Bảng chi tiết toàn bộ thẻ học */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-headline-sm text-body-lg font-bold text-on-surface">Toàn bộ thẻ học</h2>
            {cards.length > 0 && (
              <span className="text-label-sm text-outline font-mono">
                {filteredCards.length === cards.length
                  ? `${cards.length} thẻ`
                  : `Hiển thị ${filteredCards.length} / ${cards.length} thẻ`}
              </span>
            )}
          </div>

          {cards.length > 0 && (
            <div className="relative w-full sm:w-72">
              <span
                aria-hidden="true"
                className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none"
              >
                search
              </span>
              <input
                value={cardSearch}
                onChange={(e) => setCardSearch(e.target.value)}
                placeholder="Tìm từ vựng, cách đọc, nghĩa..."
                className={`${adminFieldClass} pl-8 w-full`}
              />
              {cardSearch && (
                <button
                  type="button"
                  onClick={() => setCardSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface text-label-sm"
                  title="Xoá tìm kiếm"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>

        {deck.cards === null ? (
          <p className="p-4 rounded-2xl bg-surface-container-low text-body-sm text-on-surface-variant border border-surface-container-high">
            Nội dung riêng tư, không hiển thị (chỉ xem được khi bộ thẻ công khai hoặc đang bị báo cáo khiếu nại).
          </p>
        ) : cards.length === 0 ? (
          <p className="p-6 text-center rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high text-body-md text-on-surface-variant">
            Bộ thẻ này hiện chưa có thẻ từ vựng nào.
          </p>
        ) : filteredCards.length === 0 ? (
          <p className="p-6 text-center rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high text-body-md text-on-surface-variant">
            Không tìm thấy thẻ nào khớp với từ khoá &ldquo;{cardSearch}&rdquo;.
          </p>
        ) : (
          // relative: caption sr-only (position:absolute) lấy vùng cuộn làm khối chứa, như AdminTableShell.
          <div className="relative overflow-x-auto rounded-2xl border border-surface-container-high bg-surface-container-lowest shadow-xs">
            <table className="w-full text-body-sm [&_th]:text-left [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-label-sm [&_th]:uppercase [&_th]:text-outline [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_tbody_tr]:border-t [&_tbody_tr]:border-surface-container-high">
              <caption className="sr-only">Thẻ trong bộ {deck.title}</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-12">#</th>
                  <th scope="col" className="w-48">Từ vựng (Term)</th>
                  <th scope="col" className="w-48">Cách đọc (Reading)</th>
                  <th scope="col">Ý nghĩa & Ví dụ (Meaning)</th>
                </tr>
              </thead>
              <tbody>
                {filteredCards.map((c, i) => (
                  <tr key={c.id} className="hover:bg-surface-container-low/40 transition-colors">
                    <td className="text-outline font-mono text-label-sm">{i + 1}</td>
                    <td className="font-semibold text-body-lg font-kanji text-on-surface">{c.term}</td>
                    <td className="font-kanji text-on-surface-variant text-body-md">{c.reading ?? "—"}</td>
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
