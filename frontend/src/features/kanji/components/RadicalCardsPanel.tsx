import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { JLPT_LEVELS } from "@/lib/deckUtils";
import {
  mnemonicReasonLabel,
  mnemonicSourceLabel,
  radicalDeckCards,
  radicalDeckDescription,
  radicalLabel,
} from "@/lib/kanjiUtils";
import { radicalMnemonicSourceLabel } from "@/features/kanji/mnemonicUtils";
import { extractErrorMessage } from "@/services/apiClient";
import { createDeck } from "@/services/deckService";
import { HanVietBadge } from "@/features/hanviet/components/HanVietBadge";
import type { RadicalCardsResponse } from "@/types/api.types";
import type { RadicalMnemonicSource } from "@/types/learner.types";
import { ExampleList } from "./KanjiBits";

interface RadicalCardsPanelProps {
  result: RadicalCardsResponse;
  /** Nguồn mẹo từng chữ (gồm "approved" = mẹo đã duyệt); thiếu thì dùng mnemonicSource của thẻ. */
  mnemonicSources?: Readonly<Record<string, RadicalMnemonicSource>>;
  /** Cấp người học: cấp bộ thẻ khi không chữ nào có ví dụ mang cấp. */
  userLevel: string;
  onSpeakError: (message: string) => void;
}

const isLevel = (v: string): v is (typeof JLPT_LEVELS)[number] => (JLPT_LEVELS as readonly string[]).includes(v);

// Thẻ bộ thủ (C4): mỗi chữ kèm bộ thủ, Hán-Việt, nghĩa và từ ví dụ; "Tạo bộ thẻ theo bộ thủ" tạo một bộ thẻ cho mỗi nhóm
// bộ thủ (tuần tự, để bộ nào lỗi thì vẫn biết bộ nào đã tạo). Mẹo nhớ (đợt 2): server trả mẹo quản trị viên đã duyệt
// (nhãn "Đã duyệt") nếu có, không thì câu mẫu tự động; mẹo AI mới phải qua hàng chờ duyệt ở thẻ chữ Hán.
export const RadicalCardsPanel: React.FC<RadicalCardsPanelProps> = ({ result, mnemonicSources, userLevel, onSpeakError }) => {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  // Theo chỉ số nhóm (drafts cố định trong vòng đời panel — panel mount lại khi tải thẻ mới) để bấm lại sau lỗi chỉ tạo
  // các bộ còn thiếu, không nhân đôi bộ đã tạo.
  const [created, setCreated] = useState<{ index: number; id: string; title: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const drafts = radicalDeckCards(result);
  const remaining = drafts.map((d, index) => ({ d, index })).filter(({ index }) => !created.some((c) => c.index === index));
  const byKanji = new Map(result.items.map((c) => [c.kanji, c]));
  const reasonNote = mnemonicReasonLabel(result.reason);

  const handleCreate = async () => {
    if (creating || remaining.length === 0) return;
    setCreating(true);
    setError(null);
    const done = [...created];
    try {
      for (const { d, index } of remaining) {
        const deck = await createDeck({
          title: d.title,
          level: d.level ?? (isLevel(userLevel) ? userLevel : "N5"),
          description: radicalDeckDescription(d),
          category: "kanji",
          cards: d.cards,
        });
        done.push({ index, id: deck.id, title: deck.title });
      }
      if (drafts.length === 1 && done.length === 1) {
        navigate(`/decks/${encodeURIComponent(done[0].id)}`);
        return;
      }
      setCreated(done);
    } catch (err) {
      setCreated(done);
      setError(
        `${extractErrorMessage(err)}${
          done.length > 0 ? ` (đã tạo ${done.length}/${drafts.length} bộ thẻ, xem bên dưới; bấm lại để tạo các bộ còn thiếu)` : ""
        }`
      );
    } finally {
      setCreating(false);
    }
  };

  if (result.items.length === 0) {
    return <p className="text-body-sm text-on-surface-variant">Không có dữ liệu thẻ cho các chữ đã chọn.</p>;
  }

  return (
    <section aria-label="Thẻ bộ thủ" className="flex flex-col gap-space-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h3 className="font-title-md text-title-md text-on-surface">Thẻ bộ thủ ({result.items.length} chữ)</h3>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleCreate()}
          isLoading={creating}
          disabled={remaining.length === 0}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">library_add</span>
          {created.length > 0 && remaining.length > 0
            ? `Tạo tiếp ${remaining.length} bộ còn thiếu`
            : `Tạo bộ thẻ theo bộ thủ${drafts.length > 1 ? ` (${drafts.length} bộ)` : ""}`}
        </Button>
      </div>

      {reasonNote && <p className="text-label-sm text-on-surface-variant">{reasonNote}</p>}
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
          Không tạo được bộ thẻ: {error}
        </p>
      )}
      {created.length > 0 && (
        <div role="status" className="p-3 rounded-xl bg-secondary-container/20 border border-secondary/30 text-body-sm flex flex-col gap-1">
          <span className="font-semibold text-on-surface">Đã tạo {created.length} bộ thẻ:</span>
          <ul className="list-disc pl-5">
            {created.map((d) => (
              <li key={d.id}>
                <Link to={`/decks/${encodeURIComponent(d.id)}`} className="text-primary hover:underline break-words">
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.groups.map((g, gi) => (
        <div key={g.radical ? `r${g.radical.no}` : `none-${gi}`} className="flex flex-col gap-2">
          <h4 className="text-label-md font-semibold text-on-surface-variant">
            {g.radical ? (
              <>
                Bộ <span lang="ja" className="font-japanese text-body-md text-on-surface">{g.radical.char}</span>{" "}
                {g.radical.hanViet}
                {g.radical.meaningVi && ` – ${g.radical.meaningVi}`}
              </>
            ) : (
              "Chưa rõ bộ thủ"
            )}
          </h4>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
            {g.kanji.map((k) => {
              const c = byKanji.get(k);
              if (!c) return null;
              const approved = mnemonicSources?.[k] === "approved";
              const sourceLabel = mnemonicSources?.[k]
                ? radicalMnemonicSourceLabel(mnemonicSources[k])
                : mnemonicSourceLabel(c.mnemonicSource);
              return (
                <li key={k} className="p-3 rounded-xl bg-surface-container-low border border-surface-container-high flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-start gap-3">
                    <Link
                      to={`/kanji?k=${encodeURIComponent(k)}${g.radical ? `&r=${g.radical.no}` : ""}`}
                      lang="ja"
                      title={`Tra chữ ${k}`}
                      className="font-japanese text-4xl font-bold text-on-surface hover:text-primary leading-none shrink-0"
                    >
                      {k}
                    </Link>
                    <div className="min-w-0 flex flex-col gap-0.5">
                      {c.hanViet && <HanVietBadge hanViet={c.hanViet} className="flex-wrap" />}
                      <span className="text-body-sm text-on-surface-variant break-words">
                        {c.meaningEn ?? <span className="text-outline">Chưa có nghĩa</span>}
                      </span>
                      <span className="text-label-sm text-outline">
                        {c.strokeCount != null ? `${c.strokeCount} nét` : "Chưa rõ số nét"}
                        {c.radical && ` · Bộ thủ: ${radicalLabel(c.radical)}`}
                      </span>
                    </div>
                  </div>
                  {c.mnemonicVi && (
                    <div className="p-2 rounded-lg bg-surface-container-lowest border border-surface-container-high">
                      {sourceLabel && (
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                            approved ? "text-secondary" : "text-tertiary"
                          }`}
                        >
                          <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                            {approved ? "verified" : "lightbulb"}
                          </span>
                          {sourceLabel}
                        </span>
                      )}
                      <p className="text-body-sm text-on-surface break-words">{c.mnemonicVi}</p>
                    </div>
                  )}
                  <ExampleList examples={c.examples} onSpeakError={onSpeakError} />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
};
