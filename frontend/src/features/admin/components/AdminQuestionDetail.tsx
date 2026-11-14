import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useDialog } from "@/components/ui/dialogContext";
import { useAsync } from "@/lib/useAsync";
import { fetchAdminQuestion, hideAdminQuestion, unhideAdminQuestion } from "@/services/adminQuestionService";
import type { AdminQuestionDetail as QuestionDetail, AdminQuestionFlag } from "@/types/quiz.types";
import { GENERATOR_LABELS, QUESTION_KIND_LABELS, QUESTION_STATUS_LABELS } from "@/features/quiz/quizUtils";
import { formatShort } from "../adminUtils.ts";
import { AdminStatusBadge } from "./AdminStatusBadge.tsx";
import { QuestionEditor } from "./QuestionEditor.tsx";
import { QuestionFlagRow } from "./QuestionFlagRow.tsx";

interface AdminQuestionDetailProps {
  /** null = đóng. Trang danh sách giữ id trong URL (?question=) để chia sẻ / Back được. */
  questionId: string | null;
  /** ADMIN+ mới sửa / ẩn / xử lý báo lỗi (backend vẫn kiểm lại). */
  canAct: boolean;
  onClose: () => void;
  /** Có thay đổi (sửa, ẩn, xử lý báo lỗi): trang danh sách tải lại ngầm. */
  onChanged: () => void;
}

/**
 * Chi tiết một câu trong ngân hàng câu hỏi (G3, hợp đồng §1.3): sửa câu hỏi / phương án / đáp án đúng, ẩn – hiện lại
 * khỏi đề, và danh sách báo lỗi của người học kèm nút "Đã xử lý". Dạng hộp thoại (như các "drawer" khác của dự án)
 * để admin duyệt lần lượt từng câu mà không rời bảng lọc.
 */
export const AdminQuestionDetail: React.FC<AdminQuestionDetailProps> = ({ questionId, canAct, onClose, onChanged }) => (
  <Modal
    isOpen={questionId !== null}
    onClose={onClose}
    icon="quiz"
    size="2xl"
    title="Chi tiết câu hỏi"
    subtitle={questionId ? `#${questionId}` : undefined}
    footer={
      <Button type="button" variant="outline" size="sm" onClick={onClose}>
        Đóng
      </Button>
    }
  >
    {/* key: đổi câu thì dựng lại toàn bộ (bộ sửa không mang nháp của câu trước sang). */}
    {questionId && <DetailBody key={questionId} id={questionId} canAct={canAct} onChanged={onChanged} />}
  </Modal>
);

const DetailBody: React.FC<{ id: string; canAct: boolean; onChanged: () => void }> = ({ id, canAct, onChanged }) => {
  const dialog = useDialog();
  const [retry, setRetry] = useState(0);
  const query = useAsync(() => fetchAdminQuestion(id), [id, retry]);
  // Kết quả PATCH / hide / unhide là bản chi tiết mới nhất: hiện ngay, không tải lại.
  const [latest, setLatest] = useState<QuestionDetail | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const detail = latest ?? query.data ?? null;

  if (query.loading && !detail) return <p className="text-on-surface-variant">Đang tải câu hỏi...</p>;
  if (!detail) {
    return (
      <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
        {query.error ?? "Không tải được câu hỏi."}{" "}
        <button type="button" onClick={() => setRetry((n) => n + 1)} className="underline font-semibold cursor-pointer">
          Thử lại
        </button>
      </p>
    );
  }

  const applyDetail = (next: QuestionDetail, text: string) => {
    setLatest(next);
    setStatus({ ok: true, text });
    onChanged();
  };

  const toggleHidden = async () => {
    const hiding = detail.status === "ACTIVE";
    // Hộp xác nhận chạy thao tác bên trong (loading + lỗi tại chỗ); kết quả lấy ra qua biến giữ chỗ.
    const done: { value: QuestionDetail | null } = { value: null };
    const ok = await dialog.confirm({
      title: hiding ? "Ẩn câu hỏi khỏi đề?" : "Dùng lại câu hỏi?",
      message: hiding
        ? "Các lượt làm bài mới sẽ không dùng câu này nữa. Lượt đang làm dở và kết quả cũ giữ nguyên."
        : "Câu hỏi sẽ được dùng lại khi tạo đề mới.",
      confirmLabel: hiding ? "Ẩn câu hỏi" : "Hiện lại",
      tone: hiding ? "warning" : "info",
      action: async () => {
        done.value = hiding ? await hideAdminQuestion(detail.id) : await unhideAdminQuestion(detail.id);
      },
    });
    if (ok && done.value) applyDetail(done.value, hiding ? "Đã ẩn câu hỏi khỏi đề." : "Đã dùng lại câu hỏi.");
  };

  const onFlagResolved = (flag: AdminQuestionFlag) => {
    const flags = detail.flags.map((f) => (f.id === flag.id ? { ...f, ...flag, status: "RESOLVED" as const } : f));
    setLatest({ ...detail, flags, openFlags: flags.filter((f) => f.status === "OPEN").length });
    setStatus({ ok: true, text: "Đã đánh dấu báo lỗi là đã xử lý." });
    onChanged();
  };

  const isJa = detail.kind !== "MEANING";
  const openFlags = detail.flags.filter((f) => f.status === "OPEN");
  const closedFlags = detail.flags.filter((f) => f.status !== "OPEN");

  return (
    <div className="flex flex-col gap-space-md text-body-sm">
      {/* Tóm tắt */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span lang="ja" className="font-japanese text-title-md font-bold text-on-surface">
            {detail.term || "—"}
          </span>
          <AdminStatusBadge label={QUESTION_KIND_LABELS[detail.kind]} tone="info" />
          <AdminStatusBadge
            label={QUESTION_STATUS_LABELS[detail.status]}
            tone={detail.status === "ACTIVE" ? "success" : "neutral"}
            icon={detail.status === "ACTIVE" ? "check_circle" : "visibility_off"}
          />
          {detail.generator && <AdminStatusBadge label={`Sinh bởi: ${GENERATOR_LABELS[detail.generator]}`} />}
        </div>
        <p className="text-on-surface-variant">
          Bộ thẻ:{" "}
          <Link to={`/admin/decks/${encodeURIComponent(detail.deckId)}`} className="text-primary font-semibold hover:underline">
            {detail.deckTitle ?? detail.deckId}
          </Link>{" "}
          · Cập nhật {formatShort(detail.updatedAt)} · {detail.flagCount} báo lỗi ({detail.openFlags} đang mở)
        </p>
        {canAct && (
          <div>
            <Button
              type="button"
              variant={detail.status === "ACTIVE" ? "outline" : "secondary"}
              size="sm"
              onClick={() => void toggleHidden()}
              className="min-h-11"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                {detail.status === "ACTIVE" ? "visibility_off" : "visibility"}
              </span>
              {detail.status === "ACTIVE" ? "Ẩn khỏi đề" : "Hiện lại"}
            </Button>
          </div>
        )}
        {status && (
          <p role={status.ok ? "status" : "alert"} className={status.ok ? "text-secondary font-semibold" : "text-error"}>
            {status.text}
          </p>
        )}
      </div>

      {/* Bộ sửa: key theo nội dung để lưu xong (bản mới từ server) thì nháp dựng lại từ đầu. */}
      <QuestionEditor
        key={`${detail.updatedAt ?? ""}|${detail.prompt ?? ""}|${detail.correct}|${detail.options.join("\u0001")}`}
        detail={detail}
        canAct={canAct}
        isJa={isJa}
        onSaved={(next) => applyDetail(next, "Đã lưu thay đổi câu hỏi.")}
      />

      {/* Báo lỗi của người học */}
      <section aria-labelledby={`flags-${detail.id}`} className="flex flex-col gap-2">
        <h3 id={`flags-${detail.id}`} className="font-bold text-on-surface flex items-center gap-1.5">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-outline">
            flag
          </span>
          Báo lỗi từ người học ({detail.flags.length})
        </h3>
        {detail.flags.length === 0 ? (
          <p className="text-on-surface-variant">Chưa có báo lỗi nào cho câu này.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...openFlags, ...closedFlags].map((f) => (
              <QuestionFlagRow key={f.id} flag={f} canAct={canAct} onResolved={onFlagResolved} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
