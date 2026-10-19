import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/useAuth";
import { useAsync } from "@/lib/useAsync";
import { atLeast } from "@/lib/roles";
import { SERVER_PENDING_MESSAGE, isEndpointMissing } from "@/lib/apiErrorInfo";
import { extractErrorMessage } from "@/services/apiClient";
import { fetchAdminQuestions } from "@/services/adminQuestionService";
import type { AdminQuestionPage, QuizQuestionKind, QuizQuestionStatus } from "@/types/quiz.types";
import { formatShort } from "@/features/admin/adminUtils";
import { AdminPageHeader } from "@/features/admin/components/AdminPageHeader";
import { AdminFilterBar, adminFieldClass, adminLabelClass } from "@/features/admin/components/AdminFilterBar";
import { AdminStatusBadge } from "@/features/admin/components/AdminStatusBadge";
import { AdminTableShell } from "@/features/admin/components/AdminTableShell";
import { Pager } from "@/features/admin/components/Pager";
import { useAdminQuery } from "@/features/admin/useAdminQuery";
import {
  GENERATOR_LABELS,
  QUESTION_KINDS,
  QUESTION_KIND_LABELS,
  QUESTION_STATUS_LABELS,
  isQuestionKind,
} from "@/features/quiz/quizUtils";
import { AdminQuestionDetail } from "@/features/admin/components/AdminQuestionDetail";

const PAGE_SIZE = 20;
const STATUSES: QuizQuestionStatus[] = ["ACTIVE", "HIDDEN"];

type ListResult = { page: AdminQuestionPage | null; unavailable: boolean; error?: string };

/**
 * Ngân hàng câu hỏi quiz (G3, hợp đồng API đợt 2 §1.3): lọc theo bộ thẻ / loại / trạng thái / có báo lỗi, mở chi tiết để
 * sửa phương án, ẩn câu sai khỏi đề và xử lý báo lỗi của người học. Bộ lọc + câu đang mở nằm trong URL (useAdminQuery).
 */
export const AdminQuestionsPage: React.FC = () => {
  const q = useAdminQuery();
  const { userProfile } = useAuth();
  const canAct = atLeast(userProfile?.role, "ADMIN");
  const [draftQ, setDraftQ] = useState(q.get("q"));
  const [draftDeck, setDraftDeck] = useState(q.get("deckId"));
  const [retry, setRetry] = useState(0);
  // Tải lại NGẦM sau khi sửa trong hộp chi tiết: bảng giữ nguyên, không nháy "Đang tải".
  const [version, setVersion] = useState(0);

  // Giá trị lạ trong URL (sửa tay, link cũ) -> coi như không lọc thay vì gửi lên server.
  const rawKind = q.get("kind");
  const kind: QuizQuestionKind | "" = isQuestionKind(rawKind) ? rawKind : "";
  const rawStatus = q.get("status");
  const status: QuizQuestionStatus | "" = rawStatus === "ACTIVE" || rawStatus === "HIDDEN" ? rawStatus : "";
  const flagged = q.get("flagged") === "true";
  const openId = q.get("question") || null;

  // deps liệt kê từng bộ lọc thay vì q.key: mở / đóng chi tiết (?question=) không được tải lại bảng.
  const { data, loading } = useAsync<ListResult>(
    async () => {
      try {
        const page = await fetchAdminQuestions({
          deckId: q.get("deckId"),
          kind,
          flagged,
          status,
          q: q.get("q"),
          page: q.page,
          size: PAGE_SIZE,
        });
        return { page, unavailable: false };
      } catch (e) {
        // Backend đợt 2 làm song song: chưa có endpoint thì báo nhẹ nhàng, không hiện lỗi đỏ.
        if (isEndpointMissing(e)) return { page: null, unavailable: true };
        return { page: null, unavailable: false, error: extractErrorMessage(e) };
      }
    },
    [q.get("deckId"), kind, flagged, status, q.get("q"), q.page, retry],
    version
  );
  const page = data?.page ?? null;
  const rows = page?.items ?? [];

  const pill = (active: boolean) =>
    `inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-body-sm font-semibold transition-all cursor-pointer ${
      active ? "bg-surface-container-lowest text-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface"
    }`;

  return (
    <section className="flex flex-col gap-space-lg pb-space-xl">
      <AdminPageHeader
        title="Ngân hàng câu hỏi"
        description="Câu hỏi quiz sinh từ bộ thẻ (nghĩa, kanji giống hình, đồng âm, cách đọc, chia thể). Sửa câu sai, ẩn câu khỏi đề và xử lý báo lỗi của người học."
      />

      {/* Lọc nhanh: việc thường làm nhất là duyệt câu đang bị báo lỗi */}
      <div
        className="flex items-center gap-1.5 p-1 bg-surface-container-low rounded-xl border border-surface-container-high w-fit max-w-full flex-wrap"
        role="group"
        aria-label="Lọc nhanh"
      >
        <button
          type="button"
          aria-pressed={!flagged && !status}
          onClick={() => q.set({ flagged: undefined, status: undefined })}
          className={pill(!flagged && !status)}
        >
          Tất cả
        </button>
        <button
          type="button"
          aria-pressed={flagged}
          onClick={() => q.set({ flagged: "true", status: undefined })}
          className={pill(flagged)}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
            flag
          </span>
          Có báo lỗi đang mở
        </button>
        <button
          type="button"
          aria-pressed={status === "HIDDEN" && !flagged}
          onClick={() => q.set({ status: "HIDDEN", flagged: undefined })}
          className={pill(status === "HIDDEN" && !flagged)}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
            visibility_off
          </span>
          Đã ẩn
        </button>
      </div>

      <AdminFilterBar
        onSubmit={(e) => {
          e.preventDefault();
          q.set({ q: draftQ.trim(), deckId: draftDeck.trim() });
        }}
      >
        <label className={adminLabelClass}>
          Từ / câu hỏi
          <input
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            maxLength={100}
            className={`${adminFieldClass} w-full sm:w-56`}
            placeholder="Tìm theo từ, câu hỏi..."
          />
        </label>
        <label className={adminLabelClass}>
          Mã bộ thẻ
          <input
            value={draftDeck}
            onChange={(e) => setDraftDeck(e.target.value)}
            maxLength={64}
            className={`${adminFieldClass} w-full sm:w-56 font-mono`}
            placeholder="UUID bộ thẻ"
          />
        </label>
        <label className={adminLabelClass}>
          Loại câu
          <select value={kind} onChange={(e) => q.set({ kind: e.target.value })} className={adminFieldClass}>
            <option value="">Tất cả</option>
            {QUESTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {QUESTION_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className={adminLabelClass}>
          Trạng thái
          <select value={status} onChange={(e) => q.set({ status: e.target.value })} className={adminFieldClass}>
            <option value="">Tất cả</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {QUESTION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-body-sm text-on-surface min-h-9">
          <input
            type="checkbox"
            checked={flagged}
            onChange={(e) => q.set({ flagged: e.target.checked ? "true" : undefined })}
            className="w-4 h-4"
          />
          Chỉ câu có báo lỗi
        </label>
        <Button type="submit" variant="primary" size="sm">
          Lọc
        </Button>
      </AdminFilterBar>

      {data?.unavailable ? (
        <p
          role="status"
          className="flex items-start gap-2 p-space-md rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high text-body-md text-on-surface-variant"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-outline">
            construction
          </span>
          <span>{SERVER_PENDING_MESSAGE} Ngân hàng câu hỏi sẽ hiện ở đây khi máy chủ cập nhật xong.</span>
        </p>
      ) : (
        <AdminTableShell
          caption="Ngân hàng câu hỏi quiz"
          stickyActions
          loading={loading}
          error={data?.error}
          empty={rows.length === 0}
          emptyText={flagged ? "Không còn câu hỏi nào đang bị báo lỗi." : "Không có câu hỏi nào khớp bộ lọc."}
          onRetry={() => setRetry((n) => n + 1)}
          statusText={page ? `${page.total.toLocaleString("vi-VN")} câu hỏi` : undefined}
        >
          <thead>
            <tr>
              <th scope="col">Từ & bộ thẻ</th>
              <th scope="col">Loại</th>
              <th scope="col">Câu hỏi</th>
              <th scope="col">Đáp án đúng</th>
              <th scope="col">Báo lỗi</th>
              <th scope="col">Trạng thái</th>
              <th scope="col" className="w-24">
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ja = r.kind !== "MEANING";
              return (
                <tr key={r.id} className="hover:bg-surface-container-low/40 transition-colors">
                  <td className="min-w-32">
                    <span lang="ja" className="font-japanese font-semibold text-on-surface">
                      {r.term || "—"}
                    </span>
                    <Link
                      to={`/admin/decks/${encodeURIComponent(r.deckId)}`}
                      className="block text-label-sm text-primary hover:underline line-clamp-1"
                    >
                      {r.deckTitle ?? r.deckId}
                    </Link>
                  </td>
                  <td>
                    <AdminStatusBadge label={QUESTION_KIND_LABELS[r.kind]} tone="info" />
                    {r.generator && (
                      <div className="mt-0.5 text-label-sm text-outline">{GENERATOR_LABELS[r.generator]}</div>
                    )}
                  </td>
                  <td className="min-w-48 max-w-sm">
                    <div className="line-clamp-2 text-on-surface">
                      {r.prompt ?? <span className="text-outline italic">(chỉ hiện từ)</span>}
                    </div>
                    <div className="text-label-sm text-outline">
                      {r.options.length === 0 ? "Câu gõ, không phương án" : `${r.options.length} phương án`}
                    </div>
                  </td>
                  <td className="min-w-28">
                    <span lang={ja ? "ja" : undefined} className={`font-semibold ${ja ? "font-japanese" : ""}`}>
                      {r.correct || "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    {r.openFlags > 0 ? (
                      <AdminStatusBadge label={`${r.openFlags} đang mở`} tone="error" icon="flag" />
                    ) : (
                      <span className="text-outline">0 đang mở</span>
                    )}
                    {r.flagCount > 0 && <div className="text-label-sm text-outline mt-0.5">Tổng {r.flagCount}</div>}
                  </td>
                  <td className="whitespace-nowrap">
                    <AdminStatusBadge
                      label={QUESTION_STATUS_LABELS[r.status]}
                      tone={r.status === "ACTIVE" ? "success" : "neutral"}
                      icon={r.status === "ACTIVE" ? undefined : "visibility_off"}
                    />
                    <div className="text-label-sm text-outline mt-0.5">{formatShort(r.updatedAt)}</div>
                  </td>
                  <td>
                    {/* Tên truy cập bắt đầu bằng đúng chữ hiển thị (WCAG 2.5.3): người dùng điều khiển bằng giọng nói
                        nói "Xử lý" vẫn khớp nút; từ của câu hỏi chỉ thêm ngữ cảnh ở phần sau. */}
                    <Button
                      type="button"
                      variant={r.openFlags > 0 && canAct ? "primary" : "outline"}
                      size="sm"
                      onClick={() => q.set({ question: r.id }, true)}
                      aria-label={`${r.openFlags > 0 && canAct ? "Xử lý" : "Chi tiết"} câu hỏi của từ ${r.term || "(trống)"}`}
                    >
                      {r.openFlags > 0 && canAct ? "Xử lý" : "Chi tiết"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </AdminTableShell>
      )}
      {page && <Pager page={page.page} size={page.size} total={page.total} onPage={q.setPage} />}

      <AdminQuestionDetail
        questionId={openId}
        canAct={canAct}
        onClose={() => q.set({ question: undefined }, true)}
        onChanged={() => setVersion((v) => v + 1)}
      />
    </section>
  );
};

export default AdminQuestionsPage;
