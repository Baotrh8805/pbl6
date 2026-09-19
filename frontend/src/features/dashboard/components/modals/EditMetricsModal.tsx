import React, { useState, useEffect } from "react";
import type { UserMetrics } from "../../types/dashboard.types";
import { getTargetWordsByLevel } from "../../services/dashboardService";

interface EditMetricsModalProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: UserMetrics;
  currentLevel: string;
  displayName: string;
  onSave: (updatedMetrics: UserMetrics, newLevel: string) => Promise<void>;
}

export const EditMetricsModal: React.FC<EditMetricsModalProps> = ({
  isOpen,
  onClose,
  metrics,
  currentLevel,
  displayName,
  onSave,
}) => {
  const [form, setForm] = useState<UserMetrics>(metrics);
  const [level, setLevel] = useState(currentLevel);

  useEffect(() => {
    setForm(metrics);
    setLevel(currentLevel);
  }, [metrics, currentLevel, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserMetrics = {
      ...form,
      totalTargetWords:
        form.totalTargetWords > 0 ? form.totalTargetWords : getTargetWordsByLevel(level),
    };
    await onSave(updated, level);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-inverse-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest w-full max-w-xl rounded-2xl shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 border border-surface-container-high">
        {/* Modal Header */}
        <div className="px-space-lg py-space-md bg-surface-container-low flex items-center justify-between border-b border-surface-container">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[24px]">tune</span>
            <div>
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
                Cập Nhật Chỉ Số Học Tập Của Bạn
              </h3>
              <p className="text-xs text-outline font-body-sm">
                Tùy biến các thông số cá nhân cho tài khoản {displayName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-container text-outline hover:text-on-surface transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit}>
          <div className="p-space-lg space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Trình độ JLPT mục tiêu */}
            <div className="space-y-1.5">
              <label className="font-label-md text-label-md text-on-surface font-semibold block">
                Trình độ JLPT mục tiêu
              </label>
              <div className="grid grid-cols-5 gap-2">
                {["N5", "N4", "N3", "N2", "N1"].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => {
                      setLevel(lvl);
                      setForm({
                        ...form,
                        totalTargetWords: getTargetWordsByLevel(lvl),
                      });
                    }}
                    className={`py-2 rounded-lg font-label-md text-label-md font-bold transition-all cursor-pointer border ${
                      level === lvl
                        ? "bg-primary text-on-primary border-primary shadow-sm"
                        : "bg-surface-container-low text-on-surface-variant border-surface-container-high hover:bg-surface-container"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Từ vựng */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold block">
                  Số từ vựng đã thuộc
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.wordsLearned}
                  onChange={(e) =>
                    setForm({ ...form, wordsLearned: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-body-md text-on-surface border border-surface-container-high focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold block">
                  Tổng số từ mục tiêu
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.totalTargetWords}
                  onChange={(e) =>
                    setForm({ ...form, totalTargetWords: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-body-md text-on-surface border border-surface-container-high focus:outline-none"
                />
              </div>
            </div>

            {/* Đã củng cố & Mục tiêu ngày */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold block">
                  Số từ đã củng cố vững
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.consolidatedWords}
                  onChange={(e) =>
                    setForm({ ...form, consolidatedWords: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-body-md text-on-surface border border-surface-container-high focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold block">
                  Mục tiêu thẻ mới / ngày
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.dailyGoalWords}
                  onChange={(e) =>
                    setForm({ ...form, dailyGoalWords: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-body-md text-on-surface border border-surface-container-high focus:outline-none"
                />
              </div>
            </div>

            {/* Giờ học tuần này & Tăng giảm */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold block">
                  Giờ học tuần này
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={form.studyHoursThisWeek}
                  onChange={(e) =>
                    setForm({ ...form, studyHoursThisWeek: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-body-md text-on-surface border border-surface-container-high focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold block">
                  Chênh lệch vs tuần trước (+/-)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={form.studyHoursDiff}
                  onChange={(e) =>
                    setForm({ ...form, studyHoursDiff: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-body-md text-on-surface border border-surface-container-high focus:outline-none"
                />
              </div>
            </div>

            {/* Độ chính xác Quiz */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold block">
                  Quiz chung (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={form.quizAccuracy ?? ""}
                  placeholder="VD: 88.6"
                  onChange={(e) =>
                    setForm({
                      ...form,
                      quizAccuracy: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-body-md text-on-surface border border-surface-container-high focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold block">
                  Dokkai (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.dokkaiAccuracy ?? ""}
                  placeholder="VD: 84"
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dokkaiAccuracy: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-body-md text-on-surface border border-surface-container-high focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold block">
                  Goi/Bunpou (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.bunpouAccuracy ?? ""}
                  placeholder="VD: 92"
                  onChange={(e) =>
                    setForm({
                      ...form,
                      bunpouAccuracy: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-body-md text-on-surface border border-surface-container-high focus:outline-none"
                />
              </div>
            </div>

            {/* Streak & SRS */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold block">
                  Chuỗi Streak (ngày)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.currentStreak}
                  onChange={(e) =>
                    setForm({ ...form, currentStreak: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-body-md text-on-surface border border-surface-container-high focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold block">
                  Kỷ lục (ngày)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.maxStreak}
                  onChange={(e) =>
                    setForm({ ...form, maxStreak: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-body-md text-on-surface border border-surface-container-high focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold block">
                  Thẻ SRS đến hạn
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.srsDueCount}
                  onChange={(e) =>
                    setForm({ ...form, srsDueCount: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-body-md text-on-surface border border-surface-container-high focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="px-space-lg py-3 bg-surface-container-low flex items-center justify-between border-t border-surface-container">
            <button
              type="button"
              onClick={() => {
                const fresh: UserMetrics = {
                  wordsLearned: 0,
                  totalTargetWords: getTargetWordsByLevel(level),
                  consolidatedWords: 0,
                  studyHoursThisWeek: 0,
                  studyHoursDiff: 0,
                  quizAccuracy: null,
                  dokkaiAccuracy: null,
                  bunpouAccuracy: null,
                  currentStreak: 1,
                  maxStreak: 1,
                  srsDueCount: 0,
                  dailyGoalWords: 20,
                  creditsUsed: 0,
                  totalCredits: 5000,
                };
                setForm(fresh);
              }}
              className="px-3 py-1.5 text-xs text-outline hover:text-error transition-colors cursor-pointer"
            >
              Đặt lại về 0 (Học viên mới)
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container transition-colors font-semibold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-colors shadow-sm font-semibold cursor-pointer"
              >
                Lưu Chỉ Số
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
