import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import { fetchMyTeachingClassrooms, fetchMyEnrolledClassrooms } from "@/services/classroomService";
import { CreateClassroomModal } from "@/features/classroom/components/CreateClassroomModal";
import { JoinClassModal } from "@/features/classroom/components/JoinClassModal";
import type { Classroom, JoinClassroomResult } from "@/types/classroom.types";

export const ClassroomsPage: React.FC = () => {
    const navigate = useNavigate();
    const { userProfile } = useAuth();
    const isPremium = Boolean(userProfile?.isPremium);

    const [activeTab, setActiveTab] = useState<"teaching" | "enrolled">("enrolled");
    const [teachingList, setTeachingList] = useState<Classroom[]>([]);
    const [enrolledList, setEnrolledList] = useState<Classroom[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [joinModalOpen, setJoinModalOpen] = useState(false);
    const [joinSuccessMsg, setJoinSuccessMsg] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [enrolled, teaching] = await Promise.all([
                fetchMyEnrolledClassrooms(),
                isPremium ? fetchMyTeachingClassrooms() : Promise.resolve([]),
            ]);
            setEnrolledList(enrolled);
            setTeachingList(teaching);
            if (isPremium && teaching.length > 0 && enrolled.length === 0) {
                setActiveTab("teaching");
            }
        } catch (err: any) {
            setError(err.message || "Không thể tải danh sách lớp học.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, [isPremium]);

    const handleCreated = (id: number) => {
        void loadData();
        navigate(`/classrooms/${id}`);
    };

    const handleJoined = (res: JoinClassroomResult) => {
        setJoinSuccessMsg(res.message);
        void loadData();
        if (res.status === "APPROVED") {
            navigate(`/classrooms/${res.classroomId}`);
        }
    };

    const currentList = activeTab === "teaching" ? teachingList : enrolledList;

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-[28px] text-blue-600">school</span>
                        <span>Lớp học tiếng Nhật</span>
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Học tập theo nhóm, làm bài tập theo buổi và theo dõi lộ trình của lớp.
                    </p>
                </div>

                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        onClick={() => setJoinModalOpen(true)}
                        className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                        <span className="material-symbols-outlined text-[18px]">group_add</span>
                        <span>Nhập mã vào lớp</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setCreateModalOpen(true)}
                        className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        <span>Tạo lớp học mới</span>
                        {!isPremium && (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-400 text-amber-950 font-bold text-[10px] ml-1">
                                PRO
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Thông báo lỗi */}
            {error && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">error</span>
                        <span>{error}</span>
                    </div>
                    <button type="button" onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900 font-bold">
                        ✕
                    </button>
                </div>
            )}

            {/* Thông báo kết quả tham gia */}
            {joinSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] text-emerald-600">check_circle</span>
                        <span>{joinSuccessMsg}</span>
                    </div>
                    <button type="button" onClick={() => setJoinSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 font-bold">
                        ✕
                    </button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200">
                <button
                    type="button"
                    onClick={() => setActiveTab("enrolled")}
                    className={`py-3 px-4 font-semibold text-xs border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === "enrolled"
                            ? "border-blue-600 text-blue-600"
                            : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                >
                    <span className="material-symbols-outlined text-[18px]">menu_book</span>
                    <span>Lớp đang theo học ({enrolledList.length})</span>
                </button>

                {isPremium && (
                    <button
                        type="button"
                        onClick={() => setActiveTab("teaching")}
                        className={`py-3 px-4 font-semibold text-xs border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                            activeTab === "teaching"
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-slate-500 hover:text-slate-800"
                        }`}
                    >
                        <span className="material-symbols-outlined text-[18px]">co_present</span>
                        <span>Lớp tôi giảng dạy ({teachingList.length})</span>
                    </button>
                )}
            </div>

            {/* Danh sách lớp */}
            {loading ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                    <span className="material-symbols-outlined text-[36px] animate-spin text-blue-600">sync</span>
                    <p className="text-xs">Đang tải danh sách lớp học...</p>
                </div>
            ) : currentList.length === 0 ? (
                <div className="py-16 px-4 text-center rounded-2xl border-2 border-dashed border-slate-200 bg-white space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[32px]">school</span>
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-base font-bold text-slate-800">
                            {activeTab === "teaching" ? "Bạn chưa tạo lớp học nào" : "Bạn chưa tham gia lớp học nào"}
                        </h3>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                            {activeTab === "teaching"
                                ? "Tạo lớp học để chia sẻ bộ thẻ, tạo lộ trình giảng dạy và giao bài tập cho học viên."
                                : "Nhập mã lớp từ giáo viên của bạn để vào học và làm bài tập chung cùng cả lớp."}
                        </p>
                    </div>
                    {activeTab === "teaching" ? (
                        <button
                            type="button"
                            onClick={() => setCreateModalOpen(true)}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs inline-flex items-center gap-1.5"
                        >
                            <span className="material-symbols-outlined text-[16px]">add</span>
                            <span>Tạo lớp học đầu tiên</span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setJoinModalOpen(true)}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs inline-flex items-center gap-1.5"
                        >
                            <span className="material-symbols-outlined text-[16px]">group_add</span>
                            <span>Nhập mã lớp ngay</span>
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {currentList.map((c) => (
                        <Link
                            key={c.id}
                            to={`/classrooms/${c.id}`}
                            className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between group space-y-4"
                        >
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[11px] border border-blue-200/60">
                                        {c.jlptLevel || "N5"}
                                    </span>
                                    <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">
                                            {c.privacy === "PUBLIC" ? "public" : "lock"}
                                        </span>
                                        <span>{c.privacy === "PUBLIC" ? "Công khai" : "Riêng tư"}</span>
                                    </span>
                                </div>

                                <h3 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                                    {c.name}
                                </h3>

                                {c.description && (
                                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                                        {c.description}
                                    </p>
                                )}
                            </div>

                            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                                <div className="flex items-center gap-1 font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                                    <span>Mã: {c.code}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[11px]">
                                    <span className="material-symbols-outlined text-[15px] text-slate-400">group</span>
                                    <span>{c.memberCount} / {c.maxStudents} bạn</span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            {/* Modals */}
            <CreateClassroomModal
                isOpen={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
                onCreated={handleCreated}
            />

            <JoinClassModal
                isOpen={joinModalOpen}
                onClose={() => setJoinModalOpen(false)}
                onJoined={handleJoined}
            />
        </div>
    );
};
