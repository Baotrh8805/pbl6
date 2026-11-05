import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { joinClassroomByCode } from "@/services/classroomService";
import type { JoinClassroomResult } from "@/types/classroom.types";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onJoined: (result: JoinClassroomResult) => void;
}

export const JoinClassModal: React.FC<Props> = ({ isOpen, onClose, onJoined }) => {
    const [code, setCode] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = code.trim().toUpperCase();
        if (!trimmed) {
            setError("Vui lòng nhập mã lớp học.");
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const res = await joinClassroomByCode(trimmed);
            onJoined(res);
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Mã lớp không hợp lệ hoặc không tồn tại.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Tham gia lớp học" icon="group_add" size="md">
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                {error && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">error</span>
                        <span>{error}</span>
                    </div>
                )}

                <div>
                    <label className="block font-semibold text-slate-800 mb-1.5">Mã lớp học (Class Code)</label>
                    <input
                        type="text"
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        placeholder="Ví dụ: N3-7A9"
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-center font-mono font-bold tracking-widest text-lg uppercase text-blue-700"
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                        Nhận mã lớp từ giáo viên hoặc người quản lý lớp của bạn.
                    </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors"
                    >
                        Hủy
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                    >
                        {submitting ? (
                            <>
                                <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                                <span>Đang xử lý...</span>
                            </>
                        ) : (
                            <>
                                <span>Tham gia</span>
                                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    );
};
