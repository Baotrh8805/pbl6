import React, { useId, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { labelClass, fieldClass } from "@/components/ui/formStyles";
import { fetchDeckMembers, shareDeck, unshareDeck, updateDeckPublishing } from "@/services/deckService";
import { extractErrorMessage } from "@/services/apiClient";
import { useAsync } from "@/lib/useAsync";
import { deckShareUrl } from "@/lib/deckUtils";
import { useCopyToClipboard } from "@/lib/clipboard";
import { fetchShareLink, revokeShareLink, rotateShareLink, shareLinkUrl } from "@/services/deckShareService";
import type { Deck, DeckMember, DeckVisibility, SharePermission } from "@/types/api.types";
import { CATEGORIES } from "@/features/library/components/libraryOptions";

export interface ShareDeckModalProps {
  deck: Deck;
  onClose: () => void;
}

const PERMISSIONS: { value: SharePermission; label: string }[] = [
  { value: "VIEWER", label: "Chỉ xem & học" },
  { value: "EDITOR", label: "Được chỉnh sửa" },
];

// Chủ bộ thẻ: đăng lên Thư viện cộng đồng, chia sẻ quyền theo email và gửi liên kết.
export const ShareDeckModal: React.FC<ShareDeckModalProps> = ({ deck, onClose }) => {
  // Chế độ hiển thị ĐÃ LƯU (không phải ô tick đang chỉnh): gợi ý ở khối liên kết phải nói đúng
  // ai mở được link ngay lúc này. Trang cha chỉ tải lại deck khi đóng modal nên theo dõi ở đây.
  const [visibility, setVisibility] = useState<DeckVisibility>(deck.visibility);
  return (
    <Modal isOpen onClose={onClose} title="Chia sẻ bộ thẻ" subtitle={deck.title} icon="share" size="xl">
      <div className="space-y-6">
        <PublishSection deck={deck} onSaved={setVisibility} />
        <MembersSection deckId={deck.id} />
        <LinkSection deckId={deck.id} isPublic={visibility === "public"} />
        <PrivateLinkSection deckId={deck.id} />
      </div>
    </Modal>
  );
};

const PublishSection: React.FC<{ deck: Deck; onSaved: (visibility: DeckVisibility) => void }> = ({
  deck,
  onSaved,
}) => {
  const [isPublic, setIsPublic] = useState(deck.visibility === "public");
  const [category, setCategory] = useState(deck.category ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const publicId = useId();
  const categoryId = useId();

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const visibility: DeckVisibility = isPublic ? "public" : "private";
      await updateDeckPublishing(deck, { visibility, category: category || undefined });
      setSaved(true);
      onSaved(visibility);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-sm">Thư viện cộng đồng</h3>
      <label htmlFor={publicId} className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          id={publicId}
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Công khai: mọi người đăng nhập đều xem, học và lưu bản sao được
      </label>
      <div>
        <label htmlFor={categoryId} className={`${labelClass} text-xs mb-1`}>
          Chủ đề trong Thư viện
        </label>
        <select id={categoryId} value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass}>
          <option value="" disabled={!!deck.category}>
            (Chưa chọn)
          </option>
          {CATEGORIES.filter((c) => c.id !== "all").map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="button" variant="primary" size="sm" isLoading={saving} onClick={save}>
          Lưu
        </Button>
        {saved && <span className="text-xs text-secondary" aria-live="polite">Đã lưu.</span>}
      </div>
    </section>
  );
};

const MembersSection: React.FC<{ deckId: string }> = ({ deckId }) => {
  const loaded = useAsync(() => fetchDeckMembers(deckId), [deckId]);
  // Sau mỗi lần thêm/đổi/xoá, danh sách mới thay cho bản tải ban đầu
  const [members, setMembers] = useState<DeckMember[] | null>(null);
  const list = members ?? loaded.data ?? [];

  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<SharePermission>("VIEWER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailId = useId();
  const permissionId = useId();

  const run = async (action: () => Promise<DeckMember[]>) => {
    setBusy(true);
    setError(null);
    try {
      setMembers(await action());
      return true;
    } catch (err) {
      setError(extractErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleInvite = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (await run(() => shareDeck(deckId, email.trim(), permission))) setEmail("");
  };

  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-sm">Chia sẻ với người khác</h3>
      <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1">
          <label htmlFor={emailId} className={`${labelClass} text-xs mb-1`}>
            Email người nhận
          </label>
          <input
            id={emailId}
            type="email"
            required
            maxLength={255}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ban@example.com"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor={permissionId} className={`${labelClass} text-xs mb-1`}>
            Quyền
          </label>
          <select
            id={permissionId}
            value={permission}
            onChange={(e) => setPermission(e.target.value as SharePermission)}
            className={fieldClass}
          >
            {PERMISSIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="primary" size="md" isLoading={busy}>
          Chia sẻ
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      {members === null && loaded.loading ? (
        <p className="text-xs text-outline">Đang tải danh sách...</p>
      ) : members === null && loaded.error ? (
        <p role="alert" className="text-sm text-error">
          {loaded.error}
        </p>
      ) : list.length === 0 ? (
        <p className="text-xs text-outline">Chưa chia sẻ với ai.</p>
      ) : (
        <ul className="divide-y divide-surface-container-high rounded-lg border border-surface-container-high">
          {list.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block font-medium truncate">{m.fullName || m.email}</span>
                <span className="block text-xs text-outline truncate">{m.email}</span>
              </span>
              <span className="flex items-center gap-1 shrink-0">
                <select
                  aria-label={`Quyền của ${m.email}`}
                  value={m.permission}
                  disabled={busy}
                  onChange={(e) => run(() => shareDeck(deckId, m.email, e.target.value as SharePermission))}
                  className="bg-surface-container-low px-2 py-1 rounded-lg text-xs"
                >
                  {PERMISSIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Bỏ chia sẻ với ${m.email}`}
                  onClick={() =>
                    run(async () => {
                      await unshareDeck(deckId, m.userId);
                      return list.filter((x) => x.userId !== m.userId);
                    })
                  }
                  className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-surface-container cursor-pointer"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                    person_remove
                  </span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

// Liên kết tới trang bộ thẻ (D2). Ai mở được link này phụ thuộc vào
// chế độ Công khai, danh sách mời ở trên và cả thư mục chứa bộ thẻ (backend DeckService.access
// cấp quyền xem khi thư mục được chia sẻ / để công khai), nên gợi ý đổi theo chế độ đã lưu.
const LinkSection: React.FC<{ deckId: string; isPublic: boolean }> = ({ deckId, isPublic }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { copied, copy } = useCopyToClipboard();
  const [error, setError] = useState<string | null>(null);
  const linkId = useId();
  const shareLink = deckShareUrl(window.location.origin, deckId);

  const handleCopyLink = async () => {
    const ok = await copy(shareLink, inputRef.current);
    setError(ok ? null : "Không thể sao chép tự động. Hãy chọn liên kết và sao chép thủ công.");
  };

  return (
    <section className="p-4 rounded-xl bg-surface-container-low border border-surface-container-high/60 space-y-3">
      <h3 className="font-semibold text-sm">Liên kết</h3>
      <div className="flex items-center gap-2">
        <label htmlFor={linkId} className="sr-only">
          Liên kết tới bộ thẻ
        </label>
        <input
          ref={inputRef}
          id={linkId}
          type="text"
          readOnly
          value={shareLink}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full bg-surface-container-lowest px-3 py-2 rounded-lg text-xs font-mono text-on-surface-variant select-all border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="button"
          onClick={handleCopyLink}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1 cursor-pointer active:scale-95 ${
            copied ? "bg-secondary text-on-secondary" : "bg-primary text-on-primary hover:bg-primary-container"
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
            {copied ? "check" : "content_copy"}
          </span>
          <span>{copied ? "Đã chép!" : "Sao chép"}</span>
        </button>
      </div>
      <p className="text-[11px] text-outline">
        {isPublic
          ? "Ai có tài khoản đều mở được."
          : "Chỉ người được mời theo email hoặc được xem thư mục chứa bộ thẻ mở được; bật Công khai để chia sẻ rộng."}
      </p>
      {/* Vùng thông báo cho trình đọc màn hình: nút đổi chữ nhưng không tự được đọc lại */}
      <p aria-live="polite" className="sr-only">
        {copied ? "Đã chép liên kết" : ""}
      </p>
      {error && (
        <p role="alert" className="text-xs text-error font-medium">
          {error}
        </p>
      )}
    </section>
  );
};

// Link riêng (D9): ai đã đăng nhập mở link /d/<token> thì được thêm vào danh sách với quyền Chỉ xem,
// kể cả khi bộ thẻ để riêng tư. Đổi link = link cũ hết hiệu lực; Tắt = không ai vào thêm qua link
// (người đã vào vẫn giữ quyền, gỡ ở danh sách phía trên).
const PrivateLinkSection: React.FC<{ deckId: string }> = ({ deckId }) => {
  const [reload, setReload] = useState(0);
  const current = useAsync(() => fetchShareLink(deckId), [deckId], reload);
  const [override, setOverride] = useState<{ token: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { copied, copy } = useCopyToClipboard();
  const linkId = useId();
  const token = override ? override.token : (current.data ?? null);
  const url = token ? shareLinkUrl(window.location.origin, token) : "";

  const run = async (action: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setOverride({ token: await action() });
      setReload((n) => n + 1);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const handleCopy = async () => {
    const ok = await copy(url, inputRef.current);
    setError(ok ? null : "Không thể sao chép tự động. Hãy chọn liên kết và sao chép thủ công.");
  };

  return (
    <section className="p-4 rounded-xl bg-surface-container-low border border-surface-container-high/60 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-sm">Link riêng (chỉ xem)</h3>
        {token && (
          <span className="text-[11px] font-semibold text-secondary flex items-center gap-1">
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">link</span>Đang bật
          </span>
        )}
      </div>
      {current.loading && !override ? (
        <p className="text-xs text-on-surface-variant">Đang tải…</p>
      ) : current.error && !override ? (
        <p role="alert" className="text-xs text-error">{current.error}</p>
      ) : token ? (
        <>
          <div className="flex items-center gap-2">
            <label htmlFor={linkId} className="sr-only">Link riêng tới bộ thẻ</label>
            <input
              ref={inputRef}
              id={linkId}
              type="text"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full bg-surface-container-lowest px-3 py-2 rounded-lg text-xs font-mono text-on-surface-variant select-all border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="button"
              onClick={handleCopy}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1 cursor-pointer active:scale-95 ${
                copied ? "bg-secondary text-on-secondary" : "bg-primary text-on-primary hover:bg-primary-container"
              }`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[15px]">{copied ? "check" : "content_copy"}</span>
              <span>{copied ? "Đã chép!" : "Sao chép"}</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => rotateShareLink(deckId))}>
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">autorenew</span>
              Đổi link
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(async () => (await revokeShareLink(deckId), null))}>
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">link_off</span>
              Tắt link
            </Button>
          </div>
          <p className="text-[11px] text-outline">
            Ai đã đăng nhập mở link này sẽ được thêm vào danh sách với quyền Chỉ xem, kể cả khi bộ thẻ để riêng tư. Đổi link thì link cũ hết hiệu lực.
          </p>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-outline">Tạo link để gửi cho người chưa có trong danh sách, không cần biết email của họ.</p>
          <Button size="sm" disabled={busy} onClick={() => void run(() => rotateShareLink(deckId))}>
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">add_link</span>
            Tạo link
          </Button>
        </div>
      )}
      <p aria-live="polite" className="sr-only">{copied ? "Đã chép link riêng" : ""}</p>
      {error && <p role="alert" className="text-xs text-error font-medium">{error}</p>}
    </section>
  );
};
