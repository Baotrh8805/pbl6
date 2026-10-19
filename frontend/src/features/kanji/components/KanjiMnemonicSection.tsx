import React, { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAsync } from "@/lib/useAsync";
import { mnemonicReasonLabel } from "@/lib/kanjiUtils";
import { SERVER_PENDING_MESSAGE, isEndpointMissing } from "@/lib/apiErrorInfo";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchKanjiMnemonics, generateKanjiMnemonics, submitKanjiMnemonic } from "@/services/mnemonicService";
import {
  MAX_PENDING_PER_KANJI,
  MNEMONIC_USER_MAX,
  MNEMONIC_STATUS_LABELS,
  mnemonicCharsLeft,
  mnemonicGenerateErrorMessage,
  mnemonicInputError,
  mnemonicOriginLabel,
  mnemonicSubmitErrorMessage,
  pendingCount,
} from "@/features/kanji/mnemonicUtils";
import type { KanjiMnemonics, MnemonicStatus, MyMnemonic } from "@/types/learner.types";

/** Số mẹo của mình hiện sẵn; còn lại mở bằng "Xem tất cả" để thẻ chữ không dài vô hạn khi có nhiều mẹo bị từ chối. */
const MINE_PREVIEW = 3;

const STATUS_TONE: Record<MnemonicStatus, string> = {
  PENDING: "bg-amber-50 text-amber-800 border-amber-200",
  APPROVED: "bg-secondary-container/40 text-on-secondary-fixed-variant border-secondary/30",
  REJECTED: "bg-error/10 text-error border-error/20",
};

const STATUS_ICON: Record<MnemonicStatus, string> = {
  PENDING: "hourglass_top",
  APPROVED: "verified",
  REJECTED: "block",
};

type Notice = { tone: "success" | "info" | "error"; text: string };

const NOTICE_TONE: Record<Notice["tone"], string> = {
  success: "bg-secondary-container/20 border-secondary/30 text-on-surface",
  info: "bg-surface-container-low border-surface-container-high text-on-surface-variant",
  error: "bg-error/10 border-error/20 text-error",
};

const StatusChip: React.FC<{ status: MnemonicStatus }> = ({ status }) => (
  <span
    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[11px] font-semibold ${STATUS_TONE[status]}`}
  >
    <span aria-hidden="true" className="material-symbols-outlined text-[13px]">{STATUS_ICON[status]}</span>
    {MNEMONIC_STATUS_LABELS[status]}
  </span>
);

const MineItem: React.FC<{ m: MyMnemonic }> = ({ m }) => {
  const origin = mnemonicOriginLabel(m.source, true);
  return (
    <li className="p-2 rounded-lg bg-surface-container-lowest border border-surface-container-high flex flex-col gap-1 min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip status={m.status} />
        {origin && <span className="text-[11px] text-outline">{origin}</span>}
      </div>
      <p className="text-body-sm text-on-surface break-words whitespace-pre-line">{m.mnemonicVi}</p>
      {m.status === "REJECTED" && m.reviewNote && (
        <p className="text-label-sm text-on-surface-variant break-words">Ghi chú của quản trị viên: {m.reviewNote}</p>
      )}
    </li>
  );
};

// Mẹo nhớ của một chữ trên thẻ tra chữ Hán (C4 + G2): mẹo đã duyệt (ai cũng thấy), các mẹo mình đã gửi kèm trạng thái
// duyệt, và hai cách góp mẹo — nhờ AI gợi ý hoặc tự viết. Cả hai đều vào hàng chờ quản trị viên duyệt, nên sau khi gửi
// luôn nói rõ "đang chờ duyệt" để người học không tưởng mẹo đã công khai.
export const KanjiMnemonicSection: React.FC<{ kanji: string }> = ({ kanji }) => {
  const headingId = useId();
  const textareaId = useId();
  const hintId = useId();
  const errorId = useId();
  const [version, setVersion] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showAll, setShowAll] = useState(false);

  // 404 chung / 405 = backend chưa có endpoint (đợt 2 triển khai song song): trả cờ thay vì lỗi để hiện câu bình tĩnh.
  const result = useAsync<KanjiMnemonics | "unavailable">(
    async () => {
      try {
        return await fetchKanjiMnemonics(kanji);
      } catch (e) {
        if (isEndpointMissing(e)) return "unavailable";
        throw e;
      }
    },
    [kanji, retryKey],
    version
  );
  const data = result.data && result.data !== "unavailable" ? result.data : null;
  const mine = data?.mine ?? [];
  const pending = pendingCount(mine);
  const shownMine = showAll ? mine : mine.slice(0, MINE_PREVIEW);
  const approvedOrigin = data?.approved ? mnemonicOriginLabel(data.approved.source, false) : null;
  const left = mnemonicCharsLeft(draft);

  // Máy chủ chưa có endpoint: báo trung tính (tone info), không tô đỏ như lỗi người học cần xử lý.
  const pendingNotice: Notice = { tone: "info", text: SERVER_PENDING_MESSAGE };

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    setNotice(null);
    try {
      const res = await generateKanjiMnemonics([kanji]);
      if (!res.items.some((i) => i.kanji === kanji)) {
        setNotice({
          tone: "info",
          text: "Bạn đã có mẹo đang chờ duyệt cho chữ này nên AI không viết thêm. Hãy đợi quản trị viên duyệt mẹo đó.",
        });
      } else {
        const fallback = mnemonicReasonLabel(res.reason);
        setNotice({
          tone: "success",
          text: `${fallback ?? "AI đã gợi ý một mẹo nhớ."} Mẹo đang chờ quản trị viên duyệt; khi được duyệt, mọi người học sẽ thấy.`,
        });
      }
      setVersion((v) => v + 1);
    } catch (e) {
      // 409 (đủ 50 mẹo chờ duyệt) / 429 (quá 10 lượt / giờ): câu của server nói đúng trần nào; 503: câu thân thiện.
      const text = mnemonicGenerateErrorMessage(e) ?? extractErrorMessage(e);
      setNotice(text === SERVER_PENDING_MESSAGE ? pendingNotice : { tone: "error", text: `Không nhờ AI gợi ý được: ${text}` });
    } finally {
      setGenerating(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const err = mnemonicInputError(draft);
    if (err) {
      setInputError(err);
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      await submitKanjiMnemonic(kanji, draft.trim());
      setDraft("");
      setWriting(false);
      setInputError(null);
      setNotice({ tone: "success", text: "Đã gửi mẹo nhớ — mẹo đang chờ quản trị viên duyệt." });
      setVersion((v) => v + 1);
    } catch (e2) {
      // 409 có hai trần (3 mẹo chờ duyệt cho chữ này / 50 mẹo chờ duyệt tất cả): hiện đúng câu của server, không đoán.
      // Lỗi hiện dưới ô nhập và giữ nguyên bản nháp để người học gửi lại sau khi được duyệt bớt.
      const text = mnemonicSubmitErrorMessage(e2) ?? extractErrorMessage(e2);
      if (text === SERVER_PENDING_MESSAGE) setNotice(pendingNotice);
      else setInputError(text);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      className="p-3 rounded-xl bg-tertiary-fixed/20 border border-tertiary-fixed-dim/50 flex flex-col gap-2 min-w-0"
    >
      <h3 id={headingId} className="text-label-md font-semibold text-on-surface inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-on-tertiary-fixed-variant">
          lightbulb
        </span>
        Mẹo nhớ
      </h3>

      {result.loading ? (
        <div aria-busy="true" className="h-10 rounded-lg bg-surface-container-low animate-pulse">
          <span className="sr-only">Đang tải mẹo nhớ...</span>
        </div>
      ) : result.data === "unavailable" ? (
        <p className="text-body-sm text-on-surface-variant">{SERVER_PENDING_MESSAGE}</p>
      ) : result.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-body-sm text-error">
          <span>Không tải được mẹo nhớ: {result.error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setRetryKey((n) => n + 1)}>
            Thử lại
          </Button>
        </div>
      ) : (
        <>
          {data?.approved ? (
            <figure className="flex flex-col gap-1">
              <blockquote className="text-body-sm text-on-surface break-words whitespace-pre-line">
                {data.approved.mnemonicVi}
              </blockquote>
              <figcaption className="flex flex-wrap items-center gap-1.5">
                <StatusChip status="APPROVED" />
                {approvedOrigin && <span className="text-[11px] text-outline">{approvedOrigin}</span>}
              </figcaption>
            </figure>
          ) : (
            <p className="text-body-sm text-on-surface-variant">Chưa có mẹo nhớ được duyệt.</p>
          )}

          {mine.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h4 className="text-label-sm font-semibold text-on-surface-variant">Mẹo bạn đã gửi ({mine.length})</h4>
              <ul className="flex flex-col gap-1.5">
                {shownMine.map((m) => (
                  <MineItem key={m.id} m={m} />
                ))}
              </ul>
              {mine.length > MINE_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  aria-expanded={showAll}
                  className="self-start text-label-sm font-semibold text-primary hover:underline cursor-pointer"
                >
                  {showAll ? "Thu gọn" : `Xem tất cả (${mine.length})`}
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void generate()}
              isLoading={generating}
              disabled={pending > 0}
              title={pending > 0 ? "Bạn đã có mẹo đang chờ duyệt cho chữ này" : "AI viết một mẹo nhớ, gửi quản trị viên duyệt"}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">auto_awesome</span>
              Nhờ AI gợi ý
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={writing}
              onClick={() => {
                setWriting((v) => !v);
                setInputError(null);
              }}
              disabled={!writing && pending >= MAX_PENDING_PER_KANJI}
              title={
                pending >= MAX_PENDING_PER_KANJI
                  ? `Đã có ${MAX_PENDING_PER_KANJI} mẹo chờ duyệt cho chữ này`
                  : "Viết mẹo nhớ của riêng bạn"
              }
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">edit_note</span>
              Tự viết mẹo nhớ
            </Button>
          </div>
          {/* Nút bị khoá thì title không hiện trên cảm ứng: nói lý do thành chữ. */}
          {pending > 0 && (
            <p className="text-[11px] text-on-surface-variant">
              {pending >= MAX_PENDING_PER_KANJI
                ? `Bạn đã có ${MAX_PENDING_PER_KANJI} mẹo đang chờ duyệt cho chữ này — hãy đợi quản trị viên duyệt rồi gửi thêm.`
                : "Bạn đã có mẹo đang chờ duyệt cho chữ này nên AI tạm không gợi ý thêm; bạn vẫn tự viết được."}
            </p>
          )}

          {writing && (
            <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-1.5">
              <label htmlFor={textareaId} className="text-label-sm font-semibold text-on-surface">
                Mẹo nhớ của bạn cho chữ{" "}
                <span lang="ja" className="font-japanese">
                  {kanji}
                </span>
              </label>
              <textarea
                id={textareaId}
                value={draft}
                rows={3}
                maxLength={MNEMONIC_USER_MAX}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setInputError(null);
                }}
                aria-invalid={inputError ? true : undefined}
                aria-describedby={inputError ? `${errorId} ${hintId}` : hintId}
                placeholder="Ví dụ: 休 = người (亻) tựa vào cây (木) để nghỉ ngơi."
                className="w-full px-3 py-2 rounded-lg bg-surface-container-lowest border border-surface-container-high text-body-sm text-on-surface placeholder:text-outline resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p id={hintId} className="text-[11px] text-outline">
                  Còn {Math.max(0, left)}/{MNEMONIC_USER_MAX} ký tự · mẹo được quản trị viên duyệt trước khi hiện cho mọi người.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setWriting(false);
                      setInputError(null);
                    }}
                    disabled={submitting}
                  >
                    Huỷ
                  </Button>
                  <Button type="submit" size="sm" isLoading={submitting} disabled={!draft.trim()}>
                    Gửi duyệt
                  </Button>
                </div>
              </div>
              {inputError && (
                <p id={errorId} role="alert" className="text-label-sm text-error">
                  {inputError}
                </p>
              )}
            </form>
          )}
        </>
      )}

      <div aria-live="polite">
        {notice && (
          <p className={`p-2 rounded-lg border text-label-sm flex items-start justify-between gap-2 ${NOTICE_TONE[notice.tone]}`}>
            <span className="break-words">{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Đóng thông báo"
              className="shrink-0 p-0.5 rounded hover:bg-surface-container cursor-pointer"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </p>
        )}
      </div>
    </section>
  );
};
