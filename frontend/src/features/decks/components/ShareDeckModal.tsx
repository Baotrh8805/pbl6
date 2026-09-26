import React, { useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { labelClass, fieldClass } from "@/components/ui/formStyles";
import { fetchDeckMembers, shareDeck, unshareDeck, updateDeckPublishing } from "@/services/deckService";
import { extractErrorMessage } from "@/services/apiClient";
import { useAsync } from "@/lib/useAsync";
import type { Deck, DeckMember, SharePermission } from "@/types/api.types";
import { CATEGORIES } from "@/features/library/components/libraryOptions";

export interface ShareDeckModalProps {
  deck: Deck;
  onClose: () => void;
}

const PERMISSIONS: { value: SharePermission; label: string }[] = [
  { value: "VIEWER", label: "Chỉ xem & học" },
  { value: "EDITOR", label: "Được chỉnh sửa" },
];

// Chủ bộ thẻ: đăng lên Thư viện cộng đồng và chia sẻ quyền theo email.
export const ShareDeckModal: React.FC<ShareDeckModalProps> = ({ deck, onClose }) => (
  <Modal isOpen onClose={onClose} title="Chia sẻ bộ thẻ" subtitle={deck.title} icon="share" size="xl">
    <div className="space-y-6">
      <PublishSection deck={deck} />
      <MembersSection deckId={deck.id} />
    </div>
  </Modal>
);

const PublishSection: React.FC<{ deck: Deck }> = ({ deck }) => {
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
      await updateDeckPublishing(deck, {
        visibility: isPublic ? "public" : "private",
        category: category || undefined,
      });
      setSaved(true);
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
