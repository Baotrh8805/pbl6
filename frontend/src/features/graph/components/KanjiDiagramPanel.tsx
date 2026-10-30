import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Ruby } from "@/lib/ja";
import { LevelChip } from "@/features/hanviet/components/HanVietBits";
import type {
  KanjiDiagramDetail,
  KanjiDiagramMode,
  KanjiDiagramNode,
  KanjiDiagramResponse,
  KanjiDiagramWord,
} from "@/types/kanjiDiagram.types";
import { NODE_FILL } from "@/features/graph/diagramStyle";

/**
 * Panel bên phải (spec 2026-10-30 §3.5): chữ tâm → chi tiết đầy đủ (âm On / Kun, bộ, công thức cấu tạo, từ có chữ, làm phần
 * chỉ âm); chữ khác trên sơ đồ → thẻ gọn + nút "Bắt đầu lại từ chữ này"; từ ghép → nghĩa + các chữ cấu thành; âm nhiều chữ →
 * chọn chữ. Nghĩa Việt từ dict_meanings (backend ghép), thiếu thì hiện Hán-Việt + nghĩa Anh và nút "Tra chữ này" (từ điển sẽ
 * dịch và lưu, lần sau sơ đồ có nghĩa).
 */
interface KanjiDiagramPanelProps {
  data: KanjiDiagramResponse | null;
  selectedId: string | null;
  mode: KanjiDiagramMode;
  onRecenter: (kanji: string) => void;
  onSelect: (id: string) => void;
  onMode: (mode: KanjiDiagramMode) => void;
}

const kanjiHref = (ch: string) => `/dictionary?tab=kanji&k=${encodeURIComponent(ch)}`;
const wordHref = (key: string | null, term: string) =>
  key ? `/dictionary?e=${encodeURIComponent(key)}` : `/dictionary?q=${encodeURIComponent(term)}`;

const meaningOf = (x: { meaningVi?: string | null; meaningEn?: string | null }): React.ReactNode =>
  x.meaningVi ? (
    <span className="text-on-surface">{x.meaningVi}</span>
  ) : x.meaningEn ? (
    <span className="text-on-surface-variant" title="Chưa có nghĩa tiếng Việt, hiện nghĩa tiếng Anh">
      {x.meaningEn}
    </span>
  ) : (
    <span className="text-outline">Chưa có nghĩa</span>
  );

const ROLE_LABEL: Record<string, string> = { radical: "bộ", phon: "chỉ âm", part: "thành phần" };

export const KanjiDiagramPanel: React.FC<KanjiDiagramPanelProps> = ({ data, selectedId, mode, onRecenter, onSelect, onMode }) => {
  const box = "rounded-2xl bg-surface-container-lowest border border-surface-container-high p-4 flex flex-col gap-3";
  if (!data) {
    return (
      <aside className={box} aria-label="Chi tiết chữ Hán">
        <p className="text-body-sm text-on-surface-variant">Gõ một chữ Hán hoặc âm Hán-Việt rồi Enter để xem cấu tạo, họ chữ cùng chỉ âm và từ ghép.</p>
      </aside>
    );
  }
  if (!data.center) {
    return (
      <aside className={box} aria-label="Chọn chữ">
        {data.candidates.length > 0 ? (
          <>
            <h2 className="font-title-md text-title-md font-bold text-on-surface">
              Âm «{data.query.trim().toUpperCase()}» có {data.candidates.length} chữ — chọn một chữ
            </h2>
            <ul className="flex flex-col gap-1">
              {data.candidates.map((c) => (
                <li key={c.kanji}>
                  <button
                    type="button"
                    onClick={() => onRecenter(c.kanji)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-container text-left cursor-pointer"
                  >
                    <span lang="ja" className="font-japanese text-2xl font-bold text-on-surface w-9 text-center">{c.kanji}</span>
                    <span className="text-label-sm font-bold text-primary w-16 shrink-0">{c.hanViet ?? ""}</span>
                    <span className="flex-1 min-w-0 text-body-sm truncate">{meaningOf(c)}</span>
                    <LevelChip level={c.jlpt} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <h2 className="font-title-md text-title-md font-bold text-on-surface">Không tìm thấy «{data.query}»</h2>
            <p className="text-body-sm text-on-surface-variant">
              Gõ một chữ Hán (時) hoặc âm Hán-Việt có / không dấu (THỜI, thoi). Chữ ngoài bảng Unihan hay âm không có chữ nào sẽ không vẽ được.
            </p>
          </>
        )}
      </aside>
    );
  }

  const node = data.nodes.find((n) => n.id === selectedId) ?? data.nodes.find((n) => n.id === data.center) ?? null;
  const detail = data.detail;
  const isCenter = node !== null && node.id === data.center;

  return (
    <aside className={box} aria-label="Chi tiết chữ Hán">
      {node && node.type === "word" && <WordCard node={node} data={data} onSelect={onSelect} onRecenter={onRecenter} />}
      {node && node.type !== "word" && !isCenter && <KanjiCard node={node} onRecenter={onRecenter} />}
      {(!node || isCenter) && detail && <CenterDetail detail={detail} mode={mode} onRecenter={onRecenter} onSelect={onSelect} onMode={onMode} stats={data.stats} />}
    </aside>
  );
};

// ----------------------------------------------------------------------------- chữ tâm

const Avatar: React.FC<{ ch: string; fill: string; dark?: boolean }> = ({ ch, fill, dark }) => (
  <span
    lang="ja"
    aria-hidden="true"
    className="font-japanese font-bold text-4xl w-16 h-16 rounded-full inline-flex items-center justify-center shrink-0 shadow-sm"
    style={{ background: fill, color: dark ? "#1f2937" : "#ffffff" }}
  >
    {ch}
  </span>
);

const Actions: React.FC<{ ch: string; onRecenter?: (ch: string) => void }> = ({ ch, onRecenter }) => (
  <div className="flex flex-wrap gap-2">
    {onRecenter && (
      <Button size="sm" variant="secondary" onClick={() => onRecenter(ch)}>
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">restart_alt</span>
        Bắt đầu lại từ chữ này
      </Button>
    )}
    <Link
      to={kanjiHref(ch)}
      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-outline-variant hover:border-primary text-on-surface bg-surface-container-lowest hover:bg-surface-container-low font-semibold"
    >
      Tra chữ này
      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_forward</span>
    </Link>
  </div>
);

const CenterDetail: React.FC<{
  detail: KanjiDiagramDetail;
  mode: KanjiDiagramMode;
  stats: KanjiDiagramResponse["stats"];
  onRecenter: (ch: string) => void;
  onSelect: (id: string) => void;
  onMode: (mode: KanjiDiagramMode) => void;
}> = ({ detail, mode, stats, onRecenter, onSelect, onMode }) => (
  <>
    <div className="flex items-start gap-3">
      <Avatar ch={detail.kanji} fill={NODE_FILL.center} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-title-lg font-bold text-primary tracking-wide">{detail.hanViet ?? "—"}</span>
          <LevelChip level={detail.jlpt} />
          {detail.strokeCount != null && <span className="text-label-sm text-outline">{detail.strokeCount} nét</span>}
        </div>
        <p className="text-body-md">{meaningOf(detail)}</p>
      </div>
    </div>
    <Actions ch={detail.kanji} />

    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body-sm">
      <dt className="text-on-surface-variant">Âm On</dt>
      <dd lang="ja" className="font-japanese text-on-surface">{detail.on.length ? detail.on.join("、") : <span className="text-outline">—</span>}</dd>
      <dt className="text-on-surface-variant">Âm Kun</dt>
      <dd lang="ja" className="font-japanese text-on-surface">{detail.kun.length ? detail.kun.join("、") : <span className="text-outline">—</span>}</dd>
      {detail.radical && (
        <>
          <dt className="text-on-surface-variant">Bộ thủ</dt>
          <dd className="text-on-surface">
            <Link to={`/dictionary?tab=kanji&sub=radicals&r=${detail.radical.no}`} className="hover:underline">
              <span lang="ja" className="font-japanese font-semibold">{detail.radical.char}</span> {detail.radical.nameVi}
              {detail.radical.meaningVi ? ` (${detail.radical.meaningVi})` : ""} · bộ {detail.radical.no}
            </Link>
          </dd>
        </>
      )}
    </dl>

    <section className="flex flex-col gap-1.5">
      <h3 className="text-label-md font-bold text-on-surface">Cấu tạo</h3>
      {detail.formula.length === 0 ? (
        <p className="text-body-sm text-outline">Chữ đơn, không tách thành phần.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {detail.formula.map((f, i) => (
            <React.Fragment key={`${f.part}-${i}`}>
              {i > 0 && <span className="text-on-surface-variant font-bold">+</span>}
              <button
                type="button"
                onClick={() => onSelect(`k:${f.part}`)}
                title={f.meaningVi ?? undefined}
                className={`flex flex-col items-center px-2 py-1 rounded-lg border cursor-pointer hover:bg-surface-container ${
                  f.role === "radical" ? "border-[#dc2626]" : f.role === "phon" ? "border-[#16a34a]" : "border-outline-variant"
                }`}
              >
                <span lang="ja" className="font-japanese text-xl font-bold text-on-surface">{f.part}</span>
                <span className="text-[10px] font-bold text-on-surface-variant">
                  {f.hanViet ?? "?"}
                  {f.role !== "part" ? ` · ${ROLE_LABEL[f.role]}` : ""}
                </span>
              </button>
            </React.Fragment>
          ))}
          <span className="text-on-surface-variant font-bold">=</span>
          <span lang="ja" className="font-japanese text-xl font-bold text-primary">{detail.kanji}</span>
        </div>
      )}
      {detail.phon && !detail.formula.some((f) => f.part === detail.phon) && (
        <p className="text-label-sm text-on-surface-variant">
          Phần chỉ âm là biến thể của <span lang="ja" className="font-japanese font-semibold">{detail.phon}</span>.
        </p>
      )}
    </section>

    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-label-md font-bold text-on-surface">Từ có chữ ({detail.compounds.length})</h3>
        {mode === "structure" && detail.compounds.length > 0 && (
          <button type="button" onClick={() => onMode("compounds")} className="text-label-sm font-semibold text-primary hover:underline cursor-pointer">
            Vẽ sơ đồ từ ghép
          </button>
        )}
      </div>
      {detail.compounds.length === 0 ? (
        <p className="text-body-sm text-outline">{stats.jmdict ? "Chưa có từ thông dụng chứa chữ này." : "Chưa dựng từ điển JMdict trên máy này; chỉ còn từ JLPT."}</p>
      ) : (
        <WordList words={detail.compounds} onPick={mode === "compounds" ? (w) => onSelect(`w:${w.term}`) : undefined} />
      )}
    </section>

    {detail.phonOf.length > 0 && (
      <section className="flex flex-col gap-1.5">
        <h3 className="text-label-md font-bold text-on-surface">
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold" style={{ background: NODE_FILL.phonetic, color: "#1f2937" }}>
            Làm phần chỉ âm ({detail.phonOf.length})
          </span>
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {detail.phonOf.map((p) => (
            <button
              key={p.kanji}
              type="button"
              onClick={() => onRecenter(p.kanji)}
              title={`${p.hanViet ?? ""}${p.meaningVi ? ` — ${p.meaningVi}` : ""} · ${p.sameOn ? "đọc giống" : "đọc khác"}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high cursor-pointer"
            >
              <span lang="ja" className="font-japanese text-lg font-bold text-on-surface">{p.kanji}</span>
              <span className="text-[10px] font-bold text-on-surface-variant">{p.hanViet ?? ""}</span>
              <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${p.sameOn ? "bg-[#16a34a]" : "bg-outline-variant"}`} />
            </button>
          ))}
        </div>
        <p className="text-[11px] text-outline">Chấm xanh = trùng âm On với phần chỉ âm; chấm xám = cùng phần chỉ âm nhưng đọc khác.</p>
      </section>
    )}
  </>
);

// ----------------------------------------------------------------------------- chữ khác trên sơ đồ

const KanjiCard: React.FC<{ node: KanjiDiagramNode; onRecenter: (ch: string) => void }> = ({ node, onRecenter }) => {
  const ch = node.id.startsWith("k:") ? node.id.slice(2) : node.label;
  const role =
    node.type === "component"
      ? node.role === "phon"
        ? `Thành phần chỉ âm${node.isRadical ? ", đồng thời là bộ" : ""}${node.phon && node.phon !== node.label ? ` (biến thể của ${node.phon})` : ""}`
        : node.role === "radical"
          ? "Bộ thủ của chữ đang xét"
          : "Thành phần cấu tạo"
      : node.type === "phonetic"
        ? node.sameOn
          ? "Cùng họ chỉ âm, trùng âm On"
          : "Cùng phần chỉ âm nhưng đọc khác"
        : "Chữ trong từ ghép";
  return (
    <>
      <div className="flex items-start gap-3">
        <Avatar ch={node.label} fill={NODE_FILL[node.type]} dark={node.type === "phonetic" || node.type === "kanji"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-title-lg font-bold text-primary tracking-wide">{node.hanViet ?? "—"}</span>
            <LevelChip level={node.jlpt ?? null} />
            {node.strokeCount != null && <span className="text-label-sm text-outline">{node.strokeCount} nét</span>}
          </div>
          <p className="text-body-md">{meaningOf(node)}</p>
          <p className="text-label-sm text-on-surface-variant mt-0.5">{role}</p>
        </div>
      </div>
      <Actions ch={ch} onRecenter={node.expandable || node.type !== "component" ? onRecenter : onRecenter} />
      {!node.expandable && node.type === "component" && (
        <p className="text-[11px] text-outline">Thành phần này không tách nhỏ hơn; "Bắt đầu lại" sẽ chỉ hiện bộ và từ ghép của nó.</p>
      )}
    </>
  );
};

// ----------------------------------------------------------------------------- từ ghép

const WordCard: React.FC<{
  node: KanjiDiagramNode;
  data: KanjiDiagramResponse;
  onSelect: (id: string) => void;
  onRecenter: (ch: string) => void;
}> = ({ node, data, onSelect, onRecenter }) => {
  const chars = Array.from(node.label).filter((c, i, arr) => arr.indexOf(c) === i && /[一-鿿㐀-䶿]/.test(c));
  return (
    <>
      <div className="flex items-start gap-3">
        <span
          lang="ja"
          className="font-japanese font-bold text-2xl px-3 h-12 rounded-full inline-flex items-center justify-center shrink-0 shadow-sm text-white"
          style={{ background: NODE_FILL.word }}
        >
          {node.label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {node.reading && <span lang="ja" className="font-japanese text-body-md text-on-surface-variant">{node.reading}</span>}
            <LevelChip level={node.jlpt ?? null} />
          </div>
          <p className="text-label-sm font-bold text-primary tracking-wide">{node.hanViet ?? ""}</p>
          <p className="text-body-md">{meaningOf(node)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to={wordHref(node.key ?? null, node.label)}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-outline-variant hover:border-primary text-on-surface bg-surface-container-lowest hover:bg-surface-container-low font-semibold"
        >
          Mở trong từ điển
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </Link>
      </div>
      <section className="flex flex-col gap-1.5">
        <h3 className="text-label-md font-bold text-on-surface">Các chữ trong từ</h3>
        <div className="flex flex-wrap gap-1.5">
          {chars.map((c) => {
            const onDiagram = data.nodes.some((n) => n.id === `k:${c}`);
            return (
              <button
                key={c}
                type="button"
                onClick={() => (onDiagram ? onSelect(`k:${c}`) : onRecenter(c))}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high cursor-pointer"
                title={onDiagram ? "Xem chữ này trên sơ đồ" : "Vẽ sơ đồ của chữ này"}
              >
                <span lang="ja" className="font-japanese text-lg font-bold text-on-surface">{c}</span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
};

const WordList: React.FC<{ words: KanjiDiagramWord[]; onPick?: (w: KanjiDiagramWord) => void }> = ({ words, onPick }) => (
  <ul className="flex flex-col divide-y divide-surface-container-high">
    {words.map((w) => (
      <li key={w.term} className="flex items-center gap-2 py-1.5 min-w-0">
        {onPick ? (
          <button type="button" onClick={() => onPick(w)} lang="ja" className="font-japanese text-body-md text-on-surface shrink-0 hover:text-primary cursor-pointer text-left">
            <Ruby term={w.term} reading={w.reading ?? undefined} />
          </button>
        ) : (
          <Link to={wordHref(w.key, w.term)} lang="ja" className="font-japanese text-body-md text-on-surface shrink-0 hover:text-primary">
            <Ruby term={w.term} reading={w.reading ?? undefined} />
          </Link>
        )}
        <span className="text-[10px] font-bold text-primary shrink-0 tracking-wide">{w.hanViet ?? ""}</span>
        <span className="flex-1 min-w-0 text-body-sm truncate">{meaningOf(w)}</span>
        <LevelChip level={w.jlpt} className="shrink-0" />
      </li>
    ))}
  </ul>
);
