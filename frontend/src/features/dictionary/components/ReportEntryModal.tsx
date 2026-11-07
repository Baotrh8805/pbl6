import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { extractErrorMessage } from "@/services/apiClient";
import { reportDictEntry } from "@/services/dictionaryService";
import type { DictEntry, DictReportField } from "@/types/dictionary.types";
import { REPORT_FIELD_LABELS, currentValueOf, headOf, needsSubKey, reportFieldsFor } from "../dictUtils";

// Báo lỗi mục từ / chữ Hán (D20): chọn trường sai → xem bản hiện tại → nhập đề xuất sửa + ghi chú. Admin "Áp dụng đề xuất" một nút.
export const ReportEntryModal: React.FC<{ entry: DictEntry; initialField?: DictReportField; onClose: () => void }> = ({
  entry,
  initialField,
  onClose,
}) => {
  const fields = reportFieldsFor(entry.key);
  const [field, setField] = useState<DictReportField>(initialField && fields.includes(initialField) ? initialField : fields[0]);
  const chars = entry.hanVietChars?.map((c) => c.char) ?? [];
  const examples = entry.examples ?? [];
  const sub = needsSubKey(field);
  const [subKey, setSubKey] = useState<string>("");
  const effectiveSub = sub === "char" && !entry.key.startsWith("k:") ? subKey || chars[0] || "" : sub === "example" ? subKey || examples[0]?.id || "" : "";
  const current = currentValueOf(entry, field, effectiveSub);
  const [proposed, setProposed] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const head = headOf(entry);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (field === "other" && !note.trim()) {
      setError("Hãy ghi rõ chỗ sai.");
      return;
    }
    if (field !== "other" && !proposed.trim() && !note.trim()) {
      setError("Hãy nhập đề xuất sửa hoặc ghi chú.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await reportDictEntry(entry.key, {
        field,
        subKey: effectiveSub || null,
        proposedValue: field === "other" ? null : proposed.trim() || null,
        note: note.trim() || null,
      });
      setDone(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Báo lỗi: ${head.main}`}
      icon="flag"
      subtitle="Quản trị viên sẽ kiểm tra và sửa từ điển gốc; bạn nhận thông báo khi xử lý xong."
      closeOnBackdrop={!busy}
      footer={
        done ? (
          <Button onClick={onClose}>Đóng</Button>
        ) : (
          <>
            <Button variant="ghost" type="button" onClick={onClose}>Huỷ</Button>
            <Button type="submit" form="dict-report-form" isLoading={busy}>Gửi báo lỗi</Button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-body-sm">Cảm ơn bạn! Báo lỗi đã được gửi tới quản trị viên.</p>
      ) : (
        <form id="dict-report-form" onSubmit={submit} noValidate className="flex flex-col gap-3 text-body-sm">
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Phần bị sai</span>
            <select
              value={field}
              onChange={(e) => {
                setField(e.target.value as DictReportField);
                setSubKey("");
              }}
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2"
            >
              {fields
                .filter((f) => (f === "example" || f === "example_vi" ? examples.length > 0 : true))
                .filter((f) => (f === "han_viet" && !entry.key.startsWith("k:") ? chars.length > 0 : true))
                .map((f) => (
                  <option key={f} value={f}>{REPORT_FIELD_LABELS[f]}</option>
                ))}
            </select>
          </label>
          {sub === "char" && !entry.key.startsWith("k:") && (
            <label className="flex flex-col gap-1">
              <span className="font-semibold">Chữ Hán</span>
              <select value={effectiveSub} onChange={(e) => setSubKey(e.target.value)} className="rounded-lg border border-outline-variant px-3 py-2" lang="ja">
                {chars.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}
          {sub === "example" && (
            <label className="flex flex-col gap-1">
              <span className="font-semibold">Câu ví dụ</span>
              <select value={effectiveSub} onChange={(e) => setSubKey(e.target.value)} className="rounded-lg border border-outline-variant px-3 py-2" lang="ja">
                {examples.map((x) => <option key={x.id} value={x.id}>{x.jpn.slice(0, 60)}</option>)}
              </select>
            </label>
          )}
          {field !== "other" && (
            <>
              <div className="flex flex-col gap-1">
                <span className="font-semibold">Hiện tại</span>
                <p className="rounded-lg bg-surface-container-low px-3 py-2 text-on-surface-variant min-h-9 whitespace-pre-line">{current || "(trống)"}</p>
              </div>
              <label className="flex flex-col gap-1">
                <span className="font-semibold">Đề xuất sửa</span>
                <textarea value={proposed} maxLength={1000} rows={2} onChange={(e) => setProposed(e.target.value)} className="rounded-lg border border-outline-variant px-3 py-2" />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Ghi chú {field === "other" ? "" : "(tuỳ chọn)"}</span>
            <textarea value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} className="rounded-lg border border-outline-variant px-3 py-2" placeholder="Nguồn tham khảo, ngữ cảnh…" />
          </label>
          {error && <p role="alert" className="text-xs text-error">{error}</p>}
        </form>
      )}
    </Modal>
  );
};
