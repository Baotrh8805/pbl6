import React, { useState, useEffect, useMemo } from "react";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/context/useAuth";
import { fetchDecks } from "@/services/deckService";
import { fetchFolders } from "@/services/folderService";
import { createClassroom } from "@/services/classroomService";
import type { Deck, FolderNode } from "@/types/api.types";
import type { ClassroomPrivacy, CreateLessonInput } from "@/types/classroom.types";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onCreated: (classroomId: number) => void;
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

export const CreateClassroomModal: React.FC<Props> = ({ isOpen, onClose, onCreated }) => {
    const { userProfile } = useAuth();
    const isPremium = Boolean(userProfile?.isPremium);

    const [step, setStep] = useState<1 | 2>(1);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Dữ liệu Bước 1
    const [name, setName] = useState("");
    const [jlptLevel, setJlptLevel] = useState("N3");
    const [description, setDescription] = useState("");
    const [privacy, setPrivacy] = useState<ClassroomPrivacy>("PRIVATE");
    const [maxStudents, setMaxStudents] = useState<number>(30);
    const [bookFile, setBookFile] = useState<File | null>(null);

    // Dữ liệu Bước 2
    const [numLessons, setNumLessons] = useState<number>(6);
    const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
    const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]); // T2, T4, T6
    const [lessons, setLessons] = useState<CreateLessonInput[]>([]);
    const [myDecks, setMyDecks] = useState<Deck[]>([]);
    const [folders, setFolders] = useState<FolderNode[]>([]);
    const [aiGenerating, setAiGenerating] = useState(false);

    // Modal Phân Bổ Thẻ Gộp Chung (Unified Deck Assignment Modal)
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [assignSelectedDeckIds, setAssignSelectedDeckIds] = useState<string[]>([]);
    const [assignSearch, setAssignSearch] = useState("");
    const [assignLevelFilter, setAssignLevelFilter] = useState("ALL");
    const [assignFolderFilter, setAssignFolderFilter] = useState("ALL");
    const [assignSortBy, setAssignSortBy] = useState<"newest" | "oldest" | "cards_desc" | "cards_asc" | "title_asc">("newest");
    const [assignMode, setAssignMode] = useState<"SPLIT_EVENLY" | "SEQUENTIAL">("SPLIT_EVENLY");
    const [assignAutoRename, setAssignAutoRename] = useState(true);

    // State cho dropdown chọn bộ thẻ lẻ của từng buổi học
    const [pickerOpenIdx, setPickerOpenIdx] = useState<number | null>(null);
    const [pickerSearch, setPickerSearch] = useState("");
    const [pickerLevelFilter, setPickerLevelFilter] = useState("ALL");
    const [pickerFolderFilter, setPickerFolderFilter] = useState("ALL");
    const [pickerSortBy, setPickerSortBy] = useState<"newest" | "oldest" | "cards_desc" | "cards_asc" | "title_asc">("newest");

    useEffect(() => {
        if (isOpen) {
            void fetchDecks().then(setMyDecks).catch(() => {});
            void fetchFolders().then(setFolders).catch(() => {});
        }
    }, [isOpen]);

    // Làm phẳng danh sách thư mục (hỗ trợ thư mục con nếu có)
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

    // Tổng số thẻ của các bộ đã chọn
    const totalSelectedCards = useMemo(() => {
        return assignSelectedDeckIds.reduce((sum, did) => {
            const d = myDecks.find((x) => x.id === did);
            return sum + (d?.cards?.length || 0);
        }, 0);
    }, [assignSelectedDeckIds, myDecks]);

    const cardsPerLesson = Math.ceil(totalSelectedCards / (lessons.length || 1)) || 1;

    // Hàm tính ngày học thực tế theo lịch tuần
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

    // Tự động dựng khung các buổi học dựa trên số buổi và lịch tuần
    useEffect(() => {
        if (bookFile) {
            setAiGenerating(true);
            const timer = setTimeout(() => {
                const dates = calculateDates(startDate, selectedDays, 5);
                const bookLessons: CreateLessonInput[] = Array.from({ length: 5 }, (_, i) => ({
                    orderIndex: i + 1,
                    title: `Bài ${i + 1}: ${i === 0 ? "Từ vựng mở đầu & Chào hỏi" : i === 1 ? "Sinh hoạt thường nhật & Đồ vật" : i === 2 ? "Giao tiếp công sở & Địa điểm" : `Chủ đề nâng cao bài ${i + 1}`}`,
                    scheduledDate: dates[i] || null,
                    hasQuiz: false,
                    quizDurationMinutes: 15,
                    deckIds: [],
                }));
                setLessons(bookLessons);
                setNumLessons(bookLessons.length);
                setAiGenerating(false);
            }, 600);
            return () => clearTimeout(timer);
        } else {
            const dates = calculateDates(startDate, selectedDays, numLessons);
            setLessons((prev) => {
                return Array.from({ length: numLessons }, (_, i) => ({
                    orderIndex: i + 1,
                    title: prev[i]?.title || `Buổi ${i + 1}: Bài học ${i + 1}`,
                    scheduledDate: dates[i] || null,
                    hasQuiz: false,
                    quizDurationMinutes: 15,
                    deckIds: prev[i]?.deckIds || [],
                }));
            });
        }
    }, [numLessons, startDate, selectedDays, bookFile]);

    const handleNextStep = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError("Vui lòng nhập tên lớp học.");
            return;
        }
        setError(null);
        setStep(2);
    };

    const handleLessonChange = (index: number, patch: Partial<CreateLessonInput>) => {
        setLessons((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], ...patch };
            return next;
        });
    };

    // Áp dụng từ Modal Phân Bổ Thẻ Gộp Chung
    const handleApplyAssignment = () => {
        if (assignSelectedDeckIds.length === 0) return;

        if (assignMode === "SPLIT_EVENLY") {
            // Lựa chọn B: Chia đều theo tổng số lượng thẻ
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
            // Lựa chọn A: Gán nguyên vẹn theo thứ tự (1 bộ = 1 buổi)
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

    const handleSubmit = async () => {
        if (!name.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await createClassroom({
                name: name.trim(),
                description: description.trim() || undefined,
                jlptLevel,
                privacy,
                maxStudents,
                lessons,
            });
            onCreated(res.id);
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Không thể tạo lớp học.");
        } finally {
            setSubmitting(false);
        }
    };

    if (!isPremium) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Nâng cấp tài khoản Premium" size="md">
                <div className="py-6 px-4 text-center space-y-4">
                    <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                        <span className="material-symbols-outlined text-[36px]">workspace_premium</span>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Tính năng dành cho Giáo viên Premium</h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
                            Chỉ tài khoản Premium mới có quyền tạo lớp học, phân quyền lộ trình, và theo dõi tiến độ của học viên theo từng buổi học.
                        </p>
                    </div>
                    <div className="pt-2 flex justify-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium text-xs transition-colors"
                        >
                            Để sau
                        </button>
                        <a
                            href="/premium"
                            className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold text-xs shadow-md shadow-amber-200 transition-all flex items-center gap-1.5"
                        >
                            <span className="material-symbols-outlined text-[16px]">stars</span>
                            <span>Nâng cấp ngay</span>
                        </a>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={step === 1 ? "Tạo lớp học mới (Bước 1/2)" : "Thiết kế lộ trình học (Bước 2/2)"}
                icon="school"
                size="2xl"
            >
                {error && (
                    <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">error</span>
                        <span>{error}</span>
                    </div>
                )}

                {step === 1 ? (
                    <form onSubmit={handleNextStep} className="space-y-4 text-xs">
                        <div>
                            <label className="block font-semibold text-slate-800 mb-1">Tên lớp học (*)</label>
                            <input
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ví dụ: Lớp luyện thi JLPT N3 cấp tốc - K24"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 text-sm"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block font-semibold text-slate-800 mb-1">Trình độ mục tiêu</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {JLPT_LEVELS.map((lvl) => (
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
                                <label className="block font-semibold text-slate-800 mb-1">Sĩ số học viên tối đa</label>
                                <input
                                    type="number"
                                    min={5}
                                    max={200}
                                    value={maxStudents}
                                    onChange={(e) => setMaxStudents(Number(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block font-semibold text-slate-800 mb-1">Mô tả lớp học</label>
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

                        {/* Đính kèm sách / giáo trình */}
                        <div className="pt-2 border-t border-slate-100">
                            <label className="block font-semibold text-slate-800 mb-1">
                                Tài liệu sách giáo trình (Tùy chọn - AI tự chia lộ trình)
                            </label>
                            <div className="p-3.5 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/60 flex items-center justify-between gap-3 transition-colors">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[28px] text-blue-600">menu_book</span>
                                    <div>
                                        <span className="font-semibold text-slate-800 block text-xs">
                                            {bookFile ? bookFile.name : "Tải lên file sách (PDF, DOCX hoặc ảnh)"}
                                        </span>
                                        <span className="text-[11px] text-slate-500">
                                            {bookFile
                                                ? `${(bookFile.size / 1024 / 1024).toFixed(2)} MB · AI sẽ tự động chia buổi học`
                                                : "AI sẽ tự nhận diện bài 1, bài 2... và chia buổi học hộ bạn"}
                                        </span>
                                    </div>
                                </div>
                                <label className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs cursor-pointer shadow-2xs">
                                    <span>{bookFile ? "Thay đổi" : "Chọn file"}</span>
                                    <input
                                        type="file"
                                        accept=".pdf,.docx,.txt,image/*"
                                        onChange={(e) => setBookFile(e.target.files?.[0] || null)}
                                        className="hidden"
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                type="submit"
                                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                            >
                                <span>Tiếp tục: Thiết kế lộ trình</span>
                                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="space-y-4 text-xs">
                        {bookFile ? (
                            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2.5">
                                <span className="material-symbols-outlined text-[20px] text-emerald-600">auto_awesome</span>
                                <div>
                                    <span className="font-semibold block">AI đã tự động phân tích giáo trình</span>
                                    <span className="text-[11px] text-emerald-700">
                                        Đã tạo sẵn {lessons.length} buổi học từ tài liệu. Bạn có thể kiểm tra và tùy chỉnh lại bên dưới.
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-semibold text-slate-700 mb-1">Tổng số buổi học</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={30}
                                            value={numLessons}
                                            onChange={(e) => setNumLessons(Math.max(1, Math.min(30, Number(e.target.value))))}
                                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-semibold text-slate-700 mb-1">Ngày bắt đầu</label>
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">Lịch học trong tuần (Tự tính ngày)</label>
                                    <div className="flex items-center gap-1.5">
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
                                                    className={`w-8 h-8 rounded-lg font-bold text-xs flex items-center justify-center transition-all cursor-pointer ${
                                                        active
                                                            ? "bg-blue-600 text-white shadow-xs"
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
                        )}

                        {/* THANH GỌI MODAL PHÂN BỔ BỘ THẺ THÔNG MINH (CHUNG CHO GIÁO VIÊN) */}
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
                                        Chọn nhiều bộ thẻ, lọc thư mục & tự động chia đều số lượng thẻ cho {lessons.length} buổi học.
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

                        {/* DANH SÁCH BUỔI HỌC VỚI SELECTOR TRỰC QUAN */}
                        <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                            <div className="font-bold text-slate-800 flex items-center justify-between">
                                <span>Danh sách buổi học ({lessons.length} buổi):</span>
                                <span className="text-[11px] text-slate-500 font-normal">
                                    Có thể bấm "+ Thêm bộ thẻ" ở từng buổi để thêm/bớt riêng lẻ
                                </span>
                            </div>

                            {aiGenerating ? (
                                <div className="py-12 text-center text-slate-500 space-y-2">
                                    <span className="material-symbols-outlined text-[32px] animate-spin text-blue-600">sync</span>
                                    <p>AI đang đọc cấu trúc sách và chia buổi học...</p>
                                </div>
                            ) : (
                                lessons.map((lesson, idx) => {
                                    const assignedDecks = myDecks.filter((d) => lesson.deckIds?.includes(d.id));
                                    const totalCards = assignedDecks.reduce((sum, d) => sum + (d.cards?.length || 0), 0);
                                    const isPickerOpen = pickerOpenIdx === idx;

                                    return (
                                        <div
                                            key={idx}
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
                                            </div>

                                            {/* Hiển thị các bộ thẻ đã gán (Dạng thẻ tag trực quan) */}
                                            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100 text-[11px]">
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

                                            {/* KHUNG TÌM KIẾM & CHỌN BỘ THẺ NÂNG CAO CHO BUỔI HỌC NÀY */}
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

                                                    {/* HÀNG 1: TÌM KIẾM, THƯ MỤC, SẮP XẾP */}
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
                                                                placeholder="Tìm kiếm theo tên bộ thẻ..."
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

                                                    {/* DANH SÁCH BỘ THẺ */}
                                                    <div className="max-h-60 overflow-y-auto space-y-1 pr-1 border border-slate-200 rounded-lg p-1 bg-white">
                                                        {filteredPickerDecks.length === 0 ? (
                                                            <div className="py-4 text-center text-slate-400 italic text-xs">
                                                                Không tìm thấy bộ thẻ nào phù hợp với bộ lọc
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

                                                    {/* FOOTER: THỐNG KÊ ĐÃ CHỌN CHO BUỔI NÀY */}
                                                    <div className="flex items-center justify-between pt-1 text-[11px] text-slate-600">
                                                        <span>
                                                            Đã gán cho Buổi {idx + 1}:{" "}
                                                            <strong className="text-blue-600">{lesson.deckIds?.length || 0} bộ</strong>
                                                            {" · "}Tổng cộng:{" "}
                                                            <strong className="text-indigo-600">{totalCards} thẻ</strong>
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPickerOpenIdx(null)}
                                                            className="text-blue-600 hover:underline font-semibold cursor-pointer"
                                                        >
                                                            Đóng lại ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

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
                                onClick={handleSubmit}
                                className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                            >
                                {submitting ? (
                                    <>
                                        <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                                        <span>Đang khởi tạo...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[16px]">school</span>
                                        <span>+ Hoàn tất & Tạo lớp học</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* MODAL PHÂN BỔ BỘ THẺ THÔNG MINH (GỘP CHUNG DUY NHẤT) */}
            <Modal
                isOpen={assignModalOpen}
                onClose={() => setAssignModalOpen(false)}
                title="Phân bổ bộ thẻ vào lộ trình lớp học"
                icon="tune"
                size="3xl"
                bare
            >
                <div className="flex flex-col h-[78vh] max-h-[720px] text-xs">
                    {/* KHỐI 1 (CỐ ĐỊNH TRÊN CÙNG): BỘ LỌC TÌM KIẾM, CẤP ĐỘ, THƯ MỤC, SẮP XẾP */}
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

                        {/* Bộ lọc cấp độ JLPT dạng pills */}
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

                    {/* KHỐI 2 (VÙNG CUỘN DUY NHẤT - CUỘN MƯỢT TUYỆT ĐỐI NHƯ MÀN HÌNH NHẬP DỮ LIỆU): DANH SÁCH BỘ THẺ */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-1.5 overscroll-contain">
                        {filteredDecks.length === 0 ? (
                            <div className="py-16 text-center text-slate-400 italic">
                                Không tìm thấy bộ thẻ nào phù hợp với bộ lọc
                            </div>
                        ) : (
                            filteredDecks.map((d) => {
                                const isSelected = assignSelectedDeckIds.includes(d.id);
                                const folderName = d.folderId ? folderMap.get(d.folderId) : null;
                                const cardCount = d.cards?.length || 0;

                                return (
                                    <div
                                        key={d.id}
                                        onClick={() => {
                                            setAssignSelectedDeckIds((prev) =>
                                                isSelected ? prev.filter((id) => id !== d.id) : [...prev, d.id]
                                            );
                                        }}
                                        className={`px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                            isSelected
                                                ? "border-blue-500 bg-blue-50/80 ring-1 ring-blue-500 text-blue-950 shadow-2xs"
                                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50 text-slate-700"
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div
                                                className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] shrink-0 ${
                                                    isSelected
                                                        ? "bg-blue-600 border-blue-600 text-white font-bold"
                                                        : "border-slate-300 bg-white"
                                                }`}
                                            >
                                                {isSelected && "✓"}
                                            </div>
                                            <div className="min-w-0 flex items-center gap-2">
                                                <span className="font-semibold text-xs truncate">{d.title}</span>
                                                <span className="px-1.5 py-0.2 bg-slate-100 rounded text-slate-600 font-medium text-[10px] shrink-0">
                                                    {d.level || "N3"}
                                                </span>
                                                {folderName && (
                                                    <span className="text-blue-600 font-medium truncate text-[10px] shrink-0">
                                                        📁 {folderName}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="shrink-0 text-right">
                                            <span
                                                className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                                                    isSelected
                                                        ? "bg-blue-600 text-white"
                                                        : "bg-slate-100 text-slate-700"
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

                    {/* KHỐI 3 (CỐ ĐỊNH DƯỚI ĐÁY): THANH CÔNG CỤ PHÂN BỔ & NÚT ÁP DỤNG */}
                    <div className="p-3.5 border-t border-slate-200 bg-white shrink-0 space-y-2.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                            {/* Chế độ phân bổ */}
                            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => setAssignMode("SPLIT_EVENLY")}
                                    className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                                        assignMode === "SPLIT_EVENLY"
                                            ? "bg-indigo-600 text-white shadow-2xs"
                                            : "text-slate-600 hover:text-slate-900"
                                    }`}
                                >
                                    <span>⚡ Chia đều thẻ</span>
                                    <span
                                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                            assignMode === "SPLIT_EVENLY"
                                                ? "bg-indigo-700 text-indigo-100"
                                                : "bg-indigo-50 text-indigo-700"
                                        }`}
                                    >
                                        ~{cardsPerLesson} thẻ/buổi
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setAssignMode("SEQUENTIAL")}
                                    className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                                        assignMode === "SEQUENTIAL"
                                            ? "bg-blue-600 text-white shadow-2xs"
                                            : "text-slate-600 hover:text-slate-900"
                                    }`}
                                >
                                    <span>Theo thứ tự (1 bộ = 1 buổi)</span>
                                </button>
                            </div>

                            {/* Thống kê & Tuỳ chọn đổi tên */}
                            <div className="flex items-center gap-3 text-[11px] text-slate-600 shrink-0">
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={assignAutoRename}
                                        onChange={(e) => setAssignAutoRename(e.target.checked)}
                                        className="w-3.5 h-3.5 accent-blue-600 rounded"
                                    />
                                    <span>Tự cập nhật tên buổi</span>
                                </label>
                                <span className="text-slate-300">|</span>
                                <span>
                                    Đã chọn: <strong className="text-blue-700">{assignSelectedDeckIds.length} bộ</strong> (
                                    <strong className="text-indigo-700">{totalSelectedCards} thẻ</strong>)
                                </span>
                            </div>
                        </div>

                        {/* Nút hành động */}
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setAssignModalOpen(false)}
                                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors cursor-pointer"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                type="button"
                                disabled={assignSelectedDeckIds.length === 0}
                                onClick={handleApplyAssignment}
                                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                            >
                                <span className="material-symbols-outlined text-[16px]">done_all</span>
                                <span>Áp dụng vào {lessons.length} buổi học</span>
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>
        </>
    );
};
