import React, { useState, useEffect, useMemo } from "react";
import { Modal } from "@/components/ui/Modal";
import { fetchDecks } from "@/services/deckService";
import { fetchFolders } from "@/services/folderService";
import { updateClassroom } from "@/services/classroomService";
import type { Deck, FolderNode } from "@/types/api.types";
import type { Classroom, ClassroomPrivacy } from "@/types/classroom.types";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    classroom: Classroom;
    onUpdated: (updatedClassroom: Classroom) => void;
}

interface EditableLesson {
    id?: number;
    orderIndex: number;
    title: string;
    scheduledDate?: string | null;
    deckIds: string[];
    completedMembersCount?: number;
}

const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1", "ALL"];
const WEEKDAYS = [
    { id: 1, label: "T2" },
    { id: 2, label: "T3" },
    { id: 3, label: "T4" },
    { id: 4, label: "T5" },
    { id: 5, label: "T6" },
    { id: 6, label: "T7" },
    { id: 0, label: "CN" },
];

export const EditClassroomModal: React.FC<Props> = ({ isOpen, onClose, classroom, onUpdated }) => {
    const [step, setStep] = useState<1 | 2>(1);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Dữ liệu Bước 1: Thông tin chung
    const [name, setName] = useState(classroom.name || "");
    const [jlptLevel, setJlptLevel] = useState(classroom.jlptLevel || "N3");
    const [description, setDescription] = useState(classroom.description || "");
    const [privacy, setPrivacy] = useState<ClassroomPrivacy>(classroom.privacy || "PRIVATE");
    const [maxStudents, setMaxStudents] = useState<number>(classroom.maxStudents || 30);

    // Dữ liệu Bước 2: Quản lý lộ trình buổi học
    const [lessons, setLessons] = useState<EditableLesson[]>([]);
    const [myDecks, setMyDecks] = useState<Deck[]>([]);
    const [folders, setFolders] = useState<FolderNode[]>([]);

    // Lịch tuần & ngày bắt đầu để dời lịch hàng loạt
    const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
    const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]);
    const [recalculatedMsg, setRecalculatedMsg] = useState(false);
    const [deleteConfirmLesson, setDeleteConfirmLesson] = useState<{ index: number; title: string; count: number } | null>(null);

    // Modal Phân Bổ Thẻ Gộp Chung (Smart Deck Assign)
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [assignSelectedDeckIds, setAssignSelectedDeckIds] = useState<string[]>([]);
    const [assignSearch, setAssignSearch] = useState("");
    const [assignLevelFilter, setAssignLevelFilter] = useState("ALL");
    const [assignFolderFilter, setAssignFolderFilter] = useState("ALL");
    const [assignSortBy, setAssignSortBy] = useState<"newest" | "oldest" | "cards_desc" | "cards_asc" | "title_asc">("newest");
    const [assignMode, setAssignMode] = useState<"SPLIT_EVENLY" | "SEQUENTIAL">("SPLIT_EVENLY");
    const [assignAutoRename, setAssignAutoRename] = useState(false);

    // State cho dropdown chọn bộ thẻ lẻ của từng buổi học
    const [pickerOpenIdx, setPickerOpenIdx] = useState<number | null>(null);
    const [pickerSearch, setPickerSearch] = useState("");
    const [pickerLevelFilter, setPickerLevelFilter] = useState("ALL");
    const [pickerFolderFilter, setPickerFolderFilter] = useState("ALL");
    const [pickerSortBy, setPickerSortBy] = useState<"newest" | "oldest" | "cards_desc" | "cards_asc" | "title_asc">("newest");

    // Đồng bộ state khi mở modal hoặc khi props classroom đổi
    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setError(null);
            setName(classroom.name || "");
            setJlptLevel(classroom.jlptLevel || "N3");
            setDescription(classroom.description || "");
            setPrivacy(classroom.privacy || "PRIVATE");
            setMaxStudents(classroom.maxStudents || 30);

            const initialLessons: EditableLesson[] = (classroom.lessons || []).map((l, idx) => ({
                id: l.id,
                orderIndex: l.orderIndex || idx + 1,
                title: l.title,
                scheduledDate: l.scheduledDate || null,
                deckIds: l.deckIds ? [...l.deckIds] : [],
                completedMembersCount: l.completedMembersCount || 0,
            }));
            setLessons(initialLessons);

            if (initialLessons.length > 0 && initialLessons[0].scheduledDate) {
                setStartDate(initialLessons[0].scheduledDate);
            }

            void fetchDecks().then(setMyDecks).catch(() => {});
            void fetchFolders().then(setFolders).catch(() => {});
        }
    }, [isOpen, classroom]);

    // Làm phẳng danh sách thư mục
    const allFlatFolders = useMemo(() => {
        const list: { id: string; title: string }[] = [];
        const traverse = (nodes: FolderNode[]) => {
            for (const n of nodes) {
                list.push({ id: n.id, title: n.title });
                if (n.children && n.children.length > 0) {
                    traverse(n.children);
                }
            }
        };
        traverse(folders);
        return list;
    }, [folders]);

    const folderMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const f of allFlatFolders) {
            map.set(f.id, f.title);
        }
        return map;
    }, [allFlatFolders]);

    // Lọc và sắp xếp bộ thẻ cho Modal phân bổ
    const filteredDecks = useMemo(() => {
        return myDecks
            .filter((d) => {
                const matchSearch = d.title.toLowerCase().includes(assignSearch.toLowerCase().trim());
                const matchLevel = assignLevelFilter === "ALL" || d.level?.toUpperCase() === assignLevelFilter;
                const matchFolder =
                    assignFolderFilter === "ALL" ||
                    (assignFolderFilter === "UNASSIGNED" ? !d.folderId : d.folderId === assignFolderFilter);
                return matchSearch && matchLevel && matchFolder;
            })
            .sort((a, b) => {
                if (assignSortBy === "cards_desc") return (b.cards?.length || 0) - (a.cards?.length || 0);
                if (assignSortBy === "cards_asc") return (a.cards?.length || 0) - (b.cards?.length || 0);
                if (assignSortBy === "title_asc") return a.title.localeCompare(b.title);
                if (assignSortBy === "oldest") return (a.createdAt || "").localeCompare(b.createdAt || "");
                return (b.createdAt || "").localeCompare(a.createdAt || "");
            });
    }, [myDecks, assignSearch, assignLevelFilter, assignFolderFilter, assignSortBy]);

    // Lọc và sắp xếp bộ thẻ cho ô chọn riêng của từng buổi học
    const filteredPickerDecks = useMemo(() => {
        return myDecks
            .filter((d) => {
                const matchSearch = d.title.toLowerCase().includes(pickerSearch.toLowerCase().trim());
                const matchLevel = pickerLevelFilter === "ALL" || d.level?.toUpperCase() === pickerLevelFilter;
                const matchFolder =
                    pickerFolderFilter === "ALL" ||
                    (pickerFolderFilter === "UNASSIGNED" ? !d.folderId : d.folderId === pickerFolderFilter);
                return matchSearch && matchLevel && matchFolder;
            })
            .sort((a, b) => {
                if (pickerSortBy === "cards_desc") return (b.cards?.length || 0) - (a.cards?.length || 0);
                if (pickerSortBy === "cards_asc") return (a.cards?.length || 0) - (b.cards?.length || 0);
                if (pickerSortBy === "title_asc") return a.title.localeCompare(b.title);
                if (pickerSortBy === "oldest") return (a.createdAt || "").localeCompare(b.createdAt || "");
                return (b.createdAt || "").localeCompare(a.createdAt || "");
            });
    }, [myDecks, pickerSearch, pickerLevelFilter, pickerFolderFilter, pickerSortBy]);

    const totalSelectedCards = useMemo(() => {
        return assignSelectedDeckIds.reduce((sum, did) => {
            const d = myDecks.find((x) => x.id === did);
            return sum + (d?.cards?.length || 0);
        }, 0);
    }, [assignSelectedDeckIds, myDecks]);

    const cardsPerLesson = Math.ceil(totalSelectedCards / (lessons.length || 1)) || 1;

    // Hàm tính ngày học theo lịch tuần
    const calculateDates = (startStr: string, days: number[], count: number): (string | null)[] => {
        if (!startStr || days.length === 0) return Array(count).fill(null);
        const res: (string | null)[] = [];
        const curr = new Date(startStr);
        let safety = 0;
        while (res.length < count && safety < 300) {
            safety++;
            const dayOfWeek = curr.getDay();
            if (days.includes(dayOfWeek)) {
                res.push(curr.toISOString().split("T")[0]);
            }
            curr.setDate(curr.getDate() + 1);
        }
        return res;
    };

    // Áp dụng tính lại ngày học cho toàn bộ buổi hiện có (tự động áp dụng không popup làm phiền)
    const handleRecalculateDates = () => {
        const dates = calculateDates(startDate, selectedDays, lessons.length);
        setLessons((prev) =>
            prev.map((l, i) => ({
                ...l,
                scheduledDate: dates[i] || l.scheduledDate,
            }))
        );
        setRecalculatedMsg(true);
        setTimeout(() => setRecalculatedMsg(false), 2000);
    };

    const handleLessonChange = (index: number, patch: Partial<EditableLesson>) => {
        setLessons((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], ...patch };
            return next;
        });
    };

    // Thêm buổi học mới
    const handleAddLesson = () => {
        setLessons((prev) => [
            ...prev,
            {
                orderIndex: prev.length + 1,
                title: `Buổi ${prev.length + 1}: Bài học ${prev.length + 1}`,
                scheduledDate: null,
                deckIds: [],
                completedMembersCount: 0,
            },
        ]);
    };

    // Xóa buổi học
    const handleDeleteLesson = (index: number) => {
        const lesson = lessons[index];
        if (lesson.completedMembersCount && lesson.completedMembersCount > 0) {
            // Mở dialog UI đẹp của ứng dụng nếu buổi đã có học sinh làm bài
            setDeleteConfirmLesson({
                index,
                title: lesson.title,
                count: lesson.completedMembersCount,
            });
            return;
        }

        // Nếu chưa có học sinh nào hoàn thành, xóa trực tiếp không cần hỏi
        executeDeleteLesson(index);
    };

    const executeDeleteLesson = (index: number) => {
        setLessons((prev) => {
            const remaining = prev.filter((_, i) => i !== index);
            return remaining.map((l, i) => ({ ...l, orderIndex: i + 1 }));
        });
        if (pickerOpenIdx === index) {
            setPickerOpenIdx(null);
        }
        setDeleteConfirmLesson(null);
    };

    // Áp dụng từ Modal Phân Bổ Thẻ Thông Minh
    const handleApplyAssignment = () => {
        if (assignSelectedDeckIds.length === 0) return;

        if (assignMode === "SPLIT_EVENLY") {
            const selectedDeckTitles = assignSelectedDeckIds
                .map((id) => myDecks.find((d) => d.id === id)?.title)
                .filter(Boolean);
            const joinedTitles =
                selectedDeckTitles.length === 1
                    ? selectedDeckTitles[0]
                    : `${selectedDeckTitles.length} bộ thẻ (${selectedDeckTitles.slice(0, 2).join(", ")}${
                          selectedDeckTitles.length > 2 ? "..." : ""
                      })`;

            setLessons((prev) =>
                prev.map((l, i) => {
                    const startCard = i * cardsPerLesson + 1;
                    const endCard = Math.min((i + 1) * cardsPerLesson, totalSelectedCards);
                    return {
                        ...l,
                        deckIds: assignSelectedDeckIds,
                        title:
                            assignAutoRename && totalSelectedCards > 0
                                ? `Buổi ${i + 1}: ${joinedTitles} (Thẻ ${startCard} - ${endCard})`
                                : l.title,
                    };
                })
            );
        } else {
            setLessons((prev) =>
                prev.map((l, i) => {
                    if (i < assignSelectedDeckIds.length) {
                        const did = assignSelectedDeckIds[i];
                        const d = myDecks.find((x) => x.id === did);
                        return {
                            ...l,
                            deckIds: [did],
                            title: assignAutoRename && d ? `Buổi ${i + 1}: ${d.title}` : l.title,
                        };
                    }
                    return l;
                })
            );
        }

        setAssignModalOpen(false);
    };

    const handleNextStep = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError("Vui lòng nhập tên lớp học.");
            return;
        }
        if (maxStudents < classroom.memberCount) {
            setError(`Sĩ số tối đa không thể nhỏ hơn số học viên hiện tại (${classroom.memberCount} học viên).`);
            return;
        }
        setError(null);
        setStep(2);
    };

    // Lưu toàn bộ thay đổi lớp học
    const handleSave = async () => {
        if (!name.trim()) {
            setError("Vui lòng nhập tên lớp học.");
            return;
        }
        if (maxStudents < classroom.memberCount) {
            setError(`Sĩ số tối đa không thể nhỏ hơn số học viên hiện tại (${classroom.memberCount} học viên).`);
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const updated = await updateClassroom(classroom.id, {
                name: name.trim(),
                description: description.trim() || undefined,
                jlptLevel,
                privacy,
                maxStudents,
                lessons: lessons.map((l, i) => ({
                    id: l.id,
                    orderIndex: i + 1,
                    title: l.title.trim(),
                    scheduledDate: l.scheduledDate || null,
                    deckIds: l.deckIds || [],
                })),
            });
            onUpdated(updated);
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Không thể cập nhật lớp học.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={
                    step === 1
                        ? "Chỉnh sửa thông tin lớp học (Bước 1/2)"
                        : "Quản lý lộ trình buổi học (Bước 2/2)"
                }
                icon="edit_calendar"
                size="2xl"
            >
                {error && (
                    <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">error</span>
                        <span>{error}</span>
                    </div>
                )}

                {/* BƯỚC 1: THÔNG TIN CHUNG */}
                {step === 1 ? (
                    <form onSubmit={handleNextStep} className="space-y-4 text-xs">
                        <div>
                            <label className="block font-semibold text-slate-800 mb-1">Tên lớp học (*)</label>
                            <input
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ví dụ: Lớp luyện thi JLPT N3 cấp tốc"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 text-sm"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block font-semibold text-slate-800 mb-1">Trình độ mục tiêu</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {JLPT_LEVELS.filter((l) => l !== "ALL").map((lvl) => (
                                        <button
                                            key={lvl}
                                            type="button"
                                            onClick={() => setJlptLevel(lvl)}
                                            className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all cursor-pointer ${
                                                jlptLevel === lvl
                                                    ? "bg-blue-600 text-white shadow-xs"
                                                    : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                                            }`}
                                        >
                                            {lvl}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="font-semibold text-slate-800">Sĩ số học viên tối đa</label>
                                    <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                        Hiện có: {classroom.memberCount} học viên
                                    </span>
                                </div>
                                <input
                                    type="number"
                                    min={Math.max(1, classroom.memberCount)}
                                    max={300}
                                    value={maxStudents}
                                    onChange={(e) => setMaxStudents(Number(e.target.value))}
                                    onBlur={() => {
                                        if (maxStudents < classroom.memberCount) {
                                            setMaxStudents(classroom.memberCount);
                                        }
                                    }}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                                />
                                <p className="text-[11px] text-slate-500 mt-1">
                                    {classroom.memberCount > 0 ? (
                                        <span>
                                            ⚠️ Giới hạn tối thiểu: <strong>{classroom.memberCount}</strong> (không thể giảm dưới số thành viên đang có).
                                        </span>
                                    ) : (
                                        <span>Tối thiểu 1 học viên.</span>
                                    )}
                                </p>
                            </div>
                        </div>

                        <div>
                            <label className="block font-semibold text-slate-800 mb-1">Mô tả / Lời nhắn lớp học</label>
                            <textarea
                                rows={2}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Mô tả mục tiêu khóa học, yêu cầu làm bài tập trước buổi học..."
                                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 resize-none"
                            />
                        </div>

                        <div>
                            <label className="block font-semibold text-slate-800 mb-1">Chế độ tham gia</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label
                                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                                        privacy === "PRIVATE"
                                            ? "border-blue-500 bg-blue-50/50 text-blue-950 ring-1 ring-blue-500"
                                            : "border-slate-200 hover:bg-slate-50 text-slate-700"
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="privacy"
                                        value="PRIVATE"
                                        checked={privacy === "PRIVATE"}
                                        onChange={() => setPrivacy("PRIVATE")}
                                        className="mt-0.5 accent-blue-600"
                                    />
                                    <div>
                                        <div className="font-bold flex items-center gap-1.5 text-xs">
                                            <span className="material-symbols-outlined text-[16px] text-blue-600">lock</span>
                                            <span>Riêng tư (Khuyên dùng)</span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                            Học viên nhập mã phải được giáo viên DUYỆT mới vào lớp.
                                        </p>
                                    </div>
                                </label>

                                <label
                                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                                        privacy === "PUBLIC"
                                            ? "border-blue-500 bg-blue-50/50 text-blue-950 ring-1 ring-blue-500"
                                            : "border-slate-200 hover:bg-slate-50 text-slate-700"
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="privacy"
                                        value="PUBLIC"
                                        checked={privacy === "PUBLIC"}
                                        onChange={() => setPrivacy("PUBLIC")}
                                        className="mt-0.5 accent-blue-600"
                                    />
                                    <div>
                                        <div className="font-bold flex items-center gap-1.5 text-xs">
                                            <span className="material-symbols-outlined text-[16px] text-emerald-600">public</span>
                                            <span>Công khai</span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                            Ai có mã lớp hoặc link mời đều có thể VÀO THẲNG lớp học.
                                        </p>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors cursor-pointer"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                type="submit"
                                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                            >
                                <span>Tiếp tục: Quản lý lộ trình buổi học</span>
                                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                            </button>
                        </div>
                    </form>
                ) : (
                    /* BƯỚC 2: QUẢN LÝ LỘ TRÌNH BUỔI HỌC */
                    <div className="space-y-4 text-xs">
                        {/* CÔNG CỤ DỜI LỊCH NHANH (TÙY CHỌN) */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[16px] text-blue-600">calendar_clock</span>
                                    <span>Công cụ dời lịch học hàng loạt:</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={handleRecalculateDates}
                                    className={`px-3 py-1.5 rounded-xl font-bold text-[11px] border transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                                        recalculatedMsg
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                            : "bg-white hover:bg-blue-50 text-blue-700 border-blue-200"
                                    }`}
                                    title="Tính lại ngày học cho toàn bộ buổi theo ngày bắt đầu và lịch tuần bên dưới"
                                >
                                    <span className="material-symbols-outlined text-[15px]">
                                        {recalculatedMsg ? "check_circle" : "sync"}
                                    </span>
                                    <span>{recalculatedMsg ? "Đã cập nhật ngày mới!" : "Áp dụng lại ngày học"}</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                <div>
                                    <label className="block font-semibold text-slate-600 mb-1">Ngày bắt đầu</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-600 mb-1">Lịch học trong tuần</label>
                                    <div className="flex items-center gap-1">
                                        {WEEKDAYS.map((w) => {
                                            const active = selectedDays.includes(w.id);
                                            return (
                                                <button
                                                    key={w.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedDays((prev) =>
                                                            active ? prev.filter((d) => d !== w.id) : [...prev, w.id]
                                                        );
                                                    }}
                                                    className={`w-7 h-7 rounded-lg font-bold text-[11px] flex items-center justify-center transition-all cursor-pointer ${
                                                        active
                                                            ? "bg-blue-600 text-white shadow-2xs"
                                                            : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                                                    }`}
                                                >
                                                    {w.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* THANH GỌI MODAL PHÂN BỔ THẺ THÔNG MINH */}
                        <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-50 via-indigo-50/70 to-purple-50/50 border border-blue-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                                    <span className="material-symbols-outlined text-[20px]">auto_stories</span>
                                </div>
                                <div>
                                    <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                        <span>Công cụ phân bổ bộ thẻ thông minh</span>
                                        <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 font-extrabold text-[10px]">
                                            Khuyên dùng
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        Chia đều thẻ từ nhiều bộ vào {lessons.length} buổi học hiện có.
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setAssignModalOpen(true);
                                    setAssignSearch("");
                                    setAssignLevelFilter("ALL");
                                    setAssignFolderFilter("ALL");
                                }}
                                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs hover:shadow transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[16px]">tune</span>
                                <span>Mở bảng phân bổ thẻ</span>
                            </button>
                        </div>

                        {/* DANH SÁCH CÁC BUỔI HỌC */}
                        <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                            <div className="font-bold text-slate-800 flex items-center justify-between">
                                <span>Lộ trình lớp học ({lessons.length} buổi):</span>
                                <button
                                    type="button"
                                    onClick={handleAddLesson}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                                >
                                    <span className="material-symbols-outlined text-[14px]">add</span>
                                    <span>Thêm buổi học mới</span>
                                </button>
                            </div>

                            {lessons.length === 0 ? (
                                <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                                    Chưa có buổi học nào. Bấm nút "+ Thêm buổi học mới" ở trên để tạo.
                                </div>
                            ) : (
                                lessons.map((lesson, idx) => {
                                    const assignedDecks = myDecks.filter((d) => lesson.deckIds?.includes(d.id));
                                    const totalCards = assignedDecks.reduce((sum, d) => sum + (d.cards?.length || 0), 0);
                                    const isPickerOpen = pickerOpenIdx === idx;
                                    const hasStudentCompleted = (lesson.completedMembersCount || 0) > 0;

                                    return (
                                        <div
                                            key={lesson.id ?? `new-${idx}`}
                                            className="p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 space-y-2 transition-shadow"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                                                    {idx + 1}
                                                </span>
                                                <input
                                                    type="text"
                                                    value={lesson.title}
                                                    onChange={(e) => handleLessonChange(idx, { title: e.target.value })}
                                                    placeholder={`Tiêu đề buổi ${idx + 1}`}
                                                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 focus:border-blue-500 outline-none"
                                                />
                                                <input
                                                    type="date"
                                                    value={lesson.scheduledDate || ""}
                                                    onChange={(e) => handleLessonChange(idx, { scheduledDate: e.target.value || null })}
                                                    title="Ngày học dự kiến"
                                                    className="px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 bg-white"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteLesson(idx)}
                                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                                        hasStudentCompleted
                                                            ? "text-amber-500 hover:text-rose-600 hover:bg-rose-50"
                                                            : "text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                                    }`}
                                                    title={
                                                        hasStudentCompleted
                                                            ? `Cảnh báo: Đã có ${lesson.completedMembersCount} học viên hoàn thành buổi này`
                                                            : "Xóa buổi học này"
                                                    }
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                                </button>
                                            </div>

                                            {/* Thẻ tag trạng thái đã học + Danh sách bộ thẻ gán kèm */}
                                            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100 text-[11px]">
                                                {hasStudentCompleted && (
                                                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 flex items-center gap-1 text-[10px]">
                                                        <span className="material-symbols-outlined text-[12px]">check_circle</span>
                                                        <span>{lesson.completedMembersCount} bạn đã học</span>
                                                    </span>
                                                )}

                                                <span className="text-slate-500 shrink-0 font-medium">Bộ thẻ:</span>
                                                {assignedDecks.length > 0 ? (
                                                    assignedDecks.map((d) => (
                                                        <span
                                                            key={d.id}
                                                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 font-medium"
                                                        >
                                                            <span className="font-semibold">{d.title}</span>
                                                            <span className="text-blue-500 text-[10px]">
                                                                ({d.cards?.length || 0} thẻ)
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    handleLessonChange(idx, {
                                                                        deckIds: lesson.deckIds?.filter((x) => x !== d.id) || [],
                                                                    });
                                                                }}
                                                                className="hover:text-red-600 text-slate-400 font-bold ml-0.5 cursor-pointer"
                                                                title="Bỏ bộ thẻ này"
                                                            >
                                                                ✕
                                                            </button>
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-slate-400 italic text-[11px]">Chưa gán bộ thẻ</span>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setPickerOpenIdx(isPickerOpen ? null : idx);
                                                        setPickerSearch("");
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border border-dashed border-blue-300 hover:border-blue-500 bg-white hover:bg-blue-50/60 text-blue-700 font-semibold text-[11px] transition-colors cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">
                                                        {isPickerOpen ? "expand_less" : "add"}
                                                    </span>
                                                    <span>{assignedDecks.length > 0 ? "Thêm bộ thẻ" : "Chọn bộ thẻ"}</span>
                                                </button>

                                                {totalCards > 0 && (
                                                    <span className="ml-auto text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                                                        Tổng: {totalCards} thẻ
                                                    </span>
                                                )}
                                            </div>

                                            {/* SELECTOR BỘ THẺ LẺ CHO BUỔI HỌC NÀY */}
                                            {isPickerOpen && (
                                                <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 shadow-sm space-y-2.5 animate-fadeIn">
                                                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/70">
                                                        <span className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-[15px] text-blue-600">playlist_add</span>
                                                            <span>Chọn bộ thẻ cho Buổi {idx + 1}:</span>
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPickerOpenIdx(null)}
                                                            className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] transition-colors cursor-pointer shadow-2xs"
                                                        >
                                                            Hoàn tất
                                                        </button>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                                                        <div className="sm:col-span-6 relative">
                                                            <span className="material-symbols-outlined absolute left-2 top-2 text-slate-400 text-[15px]">
                                                                search
                                                            </span>
                                                            <input
                                                                type="text"
                                                                autoFocus
                                                                value={pickerSearch}
                                                                onChange={(e) => setPickerSearch(e.target.value)}
                                                                placeholder="Tìm kiếm bộ thẻ..."
                                                                className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white focus:border-blue-500 outline-none"
                                                            />
                                                        </div>

                                                        <div className="sm:col-span-3">
                                                            <select
                                                                value={pickerFolderFilter}
                                                                onChange={(e) => setPickerFolderFilter(e.target.value)}
                                                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-700 truncate"
                                                            >
                                                                <option value="ALL">📁 Tất cả thư mục</option>
                                                                <option value="UNASSIGNED">Chưa xếp thư mục</option>
                                                                {allFlatFolders.map((f) => (
                                                                    <option key={f.id} value={f.id}>
                                                                        📁 {f.title}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div className="sm:col-span-3">
                                                            <select
                                                                value={pickerSortBy}
                                                                onChange={(e) => setPickerSortBy(e.target.value as any)}
                                                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-700"
                                                            >
                                                                <option value="newest">Mới tạo nhất</option>
                                                                <option value="oldest">Cũ nhất</option>
                                                                <option value="cards_desc">Nhiều thẻ nhất</option>
                                                                <option value="cards_asc">Ít thẻ nhất</option>
                                                                <option value="title_asc">Tên A-Z</option>
                                                            </select>
                                                        </div>
                                                    </div>

                                                    {/* HÀNG 2: BỘ LỌC CẤP ĐỘ JLPT DẠNG PILLS */}
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[10px] text-slate-500 font-semibold mr-1">Cấp độ:</span>
                                                        {["ALL", "N5", "N4", "N3", "N2", "N1"].map((lvl) => (
                                                            <button
                                                                key={lvl}
                                                                type="button"
                                                                onClick={() => setPickerLevelFilter(lvl)}
                                                                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${
                                                                    pickerLevelFilter === lvl
                                                                        ? "bg-blue-600 text-white shadow-2xs"
                                                                        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                                                                }`}
                                                            >
                                                                {lvl === "ALL" ? "Tất cả" : lvl}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {/* Danh sách bộ thẻ có sẵn */}
                                                    <div className="max-h-56 overflow-y-auto space-y-1 pr-1 border border-slate-200 rounded-lg p-1 bg-white">
                                                        {filteredPickerDecks.length === 0 ? (
                                                            <div className="py-4 text-center text-slate-400 italic text-xs">
                                                                Không tìm thấy bộ thẻ nào phù hợp
                                                            </div>
                                                        ) : (
                                                            filteredPickerDecks.map((d) => {
                                                                const isAssigned = lesson.deckIds?.includes(d.id);
                                                                const folderName = d.folderId ? folderMap.get(d.folderId) : null;
                                                                const cardCount = d.cards?.length || 0;

                                                                return (
                                                                    <div
                                                                        key={d.id}
                                                                        onClick={() => {
                                                                            const curIds = lesson.deckIds || [];
                                                                            const newIds = isAssigned
                                                                                ? curIds.filter((x) => x !== d.id)
                                                                                : [...curIds, d.id];
                                                                            handleLessonChange(idx, { deckIds: newIds });
                                                                        }}
                                                                        className={`p-2 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-colors ${
                                                                            isAssigned
                                                                                ? "bg-blue-50/90 text-blue-900 border border-blue-200 font-semibold"
                                                                                : "hover:bg-slate-50 text-slate-700 border border-transparent"
                                                                        }`}
                                                                    >
                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                            <div
                                                                                className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] shrink-0 ${
                                                                                    isAssigned
                                                                                        ? "bg-blue-600 border-blue-600 text-white font-bold"
                                                                                        : "border-slate-300 bg-white"
                                                                                }`}
                                                                            >
                                                                                {isAssigned ? "✓" : "+"}
                                                                            </div>
                                                                            <div className="min-w-0">
                                                                                <div className="truncate font-semibold">{d.title}</div>
                                                                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                                                                                    <span className="px-1 bg-slate-100 rounded text-slate-600 font-medium">
                                                                                        {d.level || "N3"}
                                                                                    </span>
                                                                                    {folderName && (
                                                                                        <span className="text-blue-600 truncate max-w-xs font-medium">
                                                                                            📁 {folderName}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="shrink-0 text-right">
                                                                            <span
                                                                                className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                                                                                    isAssigned ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                                                                                }`}
                                                                            >
                                                                                {cardCount} thẻ
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* CHÂN TRANG BƯỚC 2 */}
                        <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                                <span>Quay lại</span>
                            </button>
                            <button
                                type="button"
                                disabled={submitting}
                                onClick={handleSave}
                                className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                            >
                                {submitting ? (
                                    <>
                                        <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                                        <span>Đang lưu thay đổi...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[16px]">check</span>
                                        <span>Lưu thay đổi lớp học</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* MODAL PHÂN BỔ BỘ THẺ THÔNG MINH */}
            <Modal
                isOpen={assignModalOpen}
                onClose={() => setAssignModalOpen(false)}
                title="Phân bổ bộ thẻ vào lộ trình lớp học"
                icon="tune"
                size="3xl"
                bare
            >
                <div className="flex flex-col h-[78vh] max-h-[720px] text-xs">
                    {/* KHỐI 1: BỘ LỌC TÌM KIẾM */}
                    <div className="p-4 border-b border-slate-200/80 bg-slate-50/80 shrink-0 space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                            <div className="sm:col-span-6 relative">
                                <span className="material-symbols-outlined absolute left-2.5 top-2 text-slate-400 text-[16px]">
                                    search
                                </span>
                                <input
                                    type="text"
                                    value={assignSearch}
                                    onChange={(e) => setAssignSearch(e.target.value)}
                                    placeholder="Tìm kiếm theo tên bộ thẻ..."
                                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white focus:border-blue-500 outline-none"
                                />
                            </div>

                            <div className="sm:col-span-3">
                                <select
                                    value={assignFolderFilter}
                                    onChange={(e) => setAssignFolderFilter(e.target.value)}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-700 truncate"
                                >
                                    <option value="ALL">📁 Tất cả thư mục</option>
                                    <option value="UNASSIGNED">Chưa xếp thư mục</option>
                                    {allFlatFolders.map((f) => (
                                        <option key={f.id} value={f.id}>
                                            📁 {f.title}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="sm:col-span-3">
                                <select
                                    value={assignSortBy}
                                    onChange={(e) => setAssignSortBy(e.target.value as any)}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-700"
                                >
                                    <option value="newest">Mới tạo nhất</option>
                                    <option value="oldest">Cũ nhất</option>
                                    <option value="cards_desc">Nhiều thẻ nhất</option>
                                    <option value="cards_asc">Ít thẻ nhất</option>
                                    <option value="title_asc">Tên A-Z</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-slate-500 font-semibold mr-1">Cấp độ:</span>
                                {["ALL", "N5", "N4", "N3", "N2", "N1"].map((lvl) => (
                                    <button
                                        key={lvl}
                                        type="button"
                                        onClick={() => setAssignLevelFilter(lvl)}
                                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                                            assignLevelFilter === lvl
                                                ? "bg-blue-600 text-white shadow-2xs"
                                                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                                        }`}
                                    >
                                        {lvl === "ALL" ? "Tất cả" : lvl}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setAssignSelectedDeckIds(filteredDecks.map((d) => d.id))}
                                    className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
                                >
                                    Chọn tất cả ({filteredDecks.length})
                                </button>
                                <span className="text-slate-300">|</span>
                                <button
                                    type="button"
                                    onClick={() => setAssignSelectedDeckIds([])}
                                    className="text-[11px] text-slate-500 hover:underline cursor-pointer"
                                >
                                    Bỏ chọn hết
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* KHỐI 2: DANH SÁCH BỘ THẺ */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-1.5 overscroll-contain">
                        {filteredDecks.length === 0 ? (
                            <div className="py-16 text-center text-slate-400 italic">
                                Không tìm thấy bộ thẻ nào phù hợp với bộ lọc tìm kiếm
                            </div>
                        ) : (
                            filteredDecks.map((d) => {
                                const selected = assignSelectedDeckIds.includes(d.id);
                                const folderName = d.folderId ? folderMap.get(d.folderId) : null;
                                const cardCount = d.cards?.length || 0;

                                return (
                                    <div
                                        key={d.id}
                                        onClick={() => {
                                            setAssignSelectedDeckIds((prev) =>
                                                selected ? prev.filter((id) => id !== d.id) : [...prev, d.id]
                                            );
                                        }}
                                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                            selected
                                                ? "bg-blue-50/80 border-blue-400 text-blue-950 font-semibold shadow-2xs"
                                                : "bg-white border-slate-200/90 hover:bg-slate-50/80 text-slate-700"
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div
                                                className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors shrink-0 ${
                                                    selected
                                                        ? "bg-blue-600 border-blue-600 text-white font-bold"
                                                        : "border-slate-300 bg-white"
                                                }`}
                                            >
                                                {selected && "✓"}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate font-semibold text-xs">{d.title}</div>
                                                <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                                    <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                                                        {d.level || "N3"}
                                                    </span>
                                                    {folderName && (
                                                        <span className="text-blue-600 truncate max-w-xs font-medium">
                                                            📁 {folderName}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <span
                                                className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                                                    selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                                                }`}
                                            >
                                                {cardCount} thẻ
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* KHỐI 3: TÙY CHỌN PHÂN BỔ & NÚT XÁC NHẬN */}
                    <div className="p-4 border-t border-slate-200 bg-white shrink-0 space-y-3 shadow-lg">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label
                                className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2.5 transition-all ${
                                    assignMode === "SPLIT_EVENLY"
                                        ? "border-blue-500 bg-blue-50/50 text-blue-950 font-semibold"
                                        : "border-slate-200 hover:bg-slate-50 text-slate-600"
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="assignMode"
                                    checked={assignMode === "SPLIT_EVENLY"}
                                    onChange={() => setAssignMode("SPLIT_EVENLY")}
                                    className="mt-0.5 accent-blue-600"
                                />
                                <div>
                                    <div className="text-xs font-bold">Chia đều số thẻ cho {lessons.length} buổi học</div>
                                    <div className="text-[11px] text-slate-500 mt-0.5">
                                        Mỗi buổi học ~<strong>{cardsPerLesson} thẻ</strong> (khuyên dùng khi học sách dài)
                                    </div>
                                </div>
                            </label>

                            <label
                                className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2.5 transition-all ${
                                    assignMode === "SEQUENTIAL"
                                        ? "border-blue-500 bg-blue-50/50 text-blue-950 font-semibold"
                                        : "border-slate-200 hover:bg-slate-50 text-slate-600"
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="assignMode"
                                    checked={assignMode === "SEQUENTIAL"}
                                    onChange={() => setAssignMode("SEQUENTIAL")}
                                    className="mt-0.5 accent-blue-600"
                                />
                                <div>
                                    <div className="text-xs font-bold">Gán theo thứ tự (1 bộ = 1 buổi)</div>
                                    <div className="text-[11px] text-slate-500 mt-0.5">
                                        Buổi 1 = Bộ 1, Buổi 2 = Bộ 2...
                                    </div>
                                </div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                            <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={assignAutoRename}
                                    onChange={(e) => setAssignAutoRename(e.target.checked)}
                                    className="rounded accent-blue-600"
                                />
                                <span>Tự động đổi tiêu đề buổi học theo tên bộ thẻ & dải thẻ</span>
                            </label>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setAssignModalOpen(false)}
                                    className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors cursor-pointer"
                                >
                                    Đóng
                                </button>
                                <button
                                    type="button"
                                    disabled={assignSelectedDeckIds.length === 0}
                                    onClick={handleApplyAssignment}
                                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                                >
                                    Áp dụng vào {lessons.length} buổi học
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* MODAL XÁC NHẬN XÓA BUỔI HỌC (UI RIÊNG THUẦN REACT) */}
            {deleteConfirmLesson && (
                <Modal
                    isOpen={Boolean(deleteConfirmLesson)}
                    onClose={() => setDeleteConfirmLesson(null)}
                    title="Xác nhận xóa buổi học"
                    icon="warning"
                    size="sm"
                >
                    <div className="space-y-4 text-xs">
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 leading-relaxed">
                            Buổi học <strong>"{deleteConfirmLesson.title}"</strong> đã có{" "}
                            <strong className="text-rose-600">{deleteConfirmLesson.count} bạn đã hoàn thành</strong>.
                            <p className="mt-1 text-[11px] text-amber-700">
                                Nếu bạn xóa buổi này, tiến độ và điểm số của các học viên ở buổi học này sẽ bị xóa bỏ.
                            </p>
                        </div>
                        <p className="text-slate-600">Bạn có chắc chắn muốn xóa không?</p>
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setDeleteConfirmLesson(null)}
                                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer transition-colors"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                type="button"
                                onClick={() => executeDeleteLesson(deleteConfirmLesson.index)}
                                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer transition-colors shadow-xs"
                            >
                                Xóa buổi học
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
};
