import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { EditClassroomModal } from "@/features/classroom/components/EditClassroomModal";
import {
    fetchClassroomDetail,
    fetchPendingMembers,
    fetchApprovedMembers,
    approveMember,
    rejectMember,
    removeMember,
    updateClassroom,
    addClassroomLesson,
    fetchLessonSubmissions,
    fetchAnnouncements,
    createAnnouncement,
    deleteAnnouncement,
    addAnnouncementComment,
    deleteAnnouncementComment,
    fetchClassroomQuizzes,
    createClassroomQuiz,
    deleteClassroomQuiz,
    fetchQuizSubmissions,
    fetchClassroomLeaderboard,
} from "@/services/classroomService";
import { fetchDecks } from "@/services/deckService";
import type {
    Classroom,
    ClassroomLesson,
    ClassroomMember,
    Announcement,
    LessonSubmission,
    ClassroomQuiz,
    QuizStudentSubmission,
    LeaderboardMember,
} from "@/types/classroom.types";
import type { Deck } from "@/types/api.types";

const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"];

export const ClassroomDetailPage: React.FC = () => {
    const { id = "" } = useParams();
    const classroomId = Number(id);

    const [classroom, setClassroom] = useState<Classroom | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [activeTab, setActiveTab] = useState<"lessons" | "members" | "leaderboard" | "announcements">("lessons");
    const [pendingMembers, setPendingMembers] = useState<ClassroomMember[]>([]);
    const [approvedMembers, setApprovedMembers] = useState<ClassroomMember[]>([]);
    const [actionMsg, setActionMsg] = useState<string | null>(null);
    const [copiedCode, setCopiedCode] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);

    // Modal Cài đặt lớp
    const [settingsModalOpen, setSettingsModalOpen] = useState(false);
    const [editClassModalOpen, setEditClassModalOpen] = useState(false);
    const [editName, setEditName] = useState("");
    const [editDesc, setEditDesc] = useState("");
    const [editJlpt, setEditJlpt] = useState("N5");
    const [editPrivacy, setEditPrivacy] = useState<"PUBLIC" | "PRIVATE">("PRIVATE");
    const [editMaxStudents, setEditMaxStudents] = useState(30);
    const [savingSettings, setSavingSettings] = useState(false);

    // Modal Thêm buổi học mới (Chỉ giáo viên)
    const [addLessonModalOpen, setAddLessonModalOpen] = useState(false);
    const [newLessonTitle, setNewLessonTitle] = useState("");
    const [newLessonDate, setNewLessonDate] = useState("");
    const [newLessonHasQuiz, setNewLessonHasQuiz] = useState(false);
    const [newLessonQuizDuration, setNewLessonQuizDuration] = useState(15);
    const [newLessonDeckIds, setNewLessonDeckIds] = useState<string[]>([]);
    const [myDecks, setMyDecks] = useState<Deck[]>([]);
    const [savingLesson, setSavingLesson] = useState(false);

    // Modal Xem học viên nộp bài / hoàn thành của từng buổi
    const [submissionLesson, setSubmissionLesson] = useState<ClassroomLesson | null>(null);
    const [submissions, setSubmissions] = useState<LessonSubmission[]>([]);
    const [loadingSubmissions, setLoadingSubmissions] = useState(false);

    // Bài kiểm tra riêng (Classroom Quizzes)
    const [quizzes, setQuizzes] = useState<ClassroomQuiz[]>([]);
    const [createQuizModalOpen, setCreateQuizModalOpen] = useState(false);
    const [quizLessonId, setQuizLessonId] = useState<number | null>(null);
    const [quizTitle, setQuizTitle] = useState("");
    const [quizDescription, setQuizDescription] = useState("");
    const [quizDuration, setQuizDuration] = useState(15);
    const [quizQuestionCount, setQuizQuestionCount] = useState(30);
    const [selectedQuizDecks, setSelectedQuizDecks] = useState<string[]>([]);
    const [quizDeckSearch, setQuizDeckSearch] = useState("");
    const [savingQuiz, setSavingQuiz] = useState(false);

    // Modal xem danh sách điểm thi của học sinh (Giáo viên)
    const [quizSubmissionsModalOpen, setQuizSubmissionsModalOpen] = useState(false);
    const [viewingQuiz, setViewingQuiz] = useState<ClassroomQuiz | null>(null);
    const [quizSubmissions, setQuizSubmissions] = useState<QuizStudentSubmission[]>([]);
    const [loadingQuizSubmissions, setLoadingQuizSubmissions] = useState(false);

    // Bảng xếp hạng lớp học
    const [leaderboard, setLeaderboard] = useState<LeaderboardMember[]>([]);
    const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

    // Tab Bảng tin
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);
    const [newPostTitle, setNewPostTitle] = useState("");
    const [newPostContent, setNewPostContent] = useState("");
    const [newPostPinned, setNewPostPinned] = useState(false);
    const [posting, setPosting] = useState(false);
    const [commentTexts, setCommentTexts] = useState<Record<number, string>>({});
    const [sendingComment, setSendingComment] = useState<Record<number, boolean>>({});

    const loadClassroom = async () => {
        if (!classroomId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await fetchClassroomDetail(classroomId);
            setClassroom(data);
            setEditName(data.name);
            setEditDesc(data.description || "");
            setEditJlpt(data.jlptLevel || "N5");
            setEditPrivacy(data.privacy);
            setEditMaxStudents(data.maxStudents || 30);

            try {
                if (data.isOwner) {
                    const [pending, approved, quizList] = await Promise.all([
                        fetchPendingMembers(classroomId).catch(() => []),
                        fetchApprovedMembers(classroomId).catch(() => []),
                        fetchClassroomQuizzes(classroomId).catch(() => []),
                    ]);
                    setPendingMembers(pending);
                    setApprovedMembers(approved);
                    setQuizzes(quizList);
                } else {
                    const [approved, quizList] = await Promise.all([
                        fetchApprovedMembers(classroomId).catch(() => []),
                        fetchClassroomQuizzes(classroomId).catch(() => []),
                    ]);
                    setApprovedMembers(approved);
                    setQuizzes(quizList);
                }
            } catch (memberErr) {
                console.warn("Lỗi nạp thành viên / quizzes:", memberErr);
            }
        } catch (err: any) {
            console.error("[ClassroomDetail] Lỗi tải chi tiết lớp học:", err);
            setError(err.response?.data?.message || err.message || "Không thể tải thông tin lớp học.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadClassroom();
    }, [classroomId]);

    // Khi giáo viên mở modal thêm buổi học hoặc tạo quiz, nạp danh sách bộ thẻ của giáo viên
    useEffect(() => {
        if ((addLessonModalOpen || createQuizModalOpen) && myDecks.length === 0) {
            void fetchDecks()
                .then((d) => setMyDecks(d || []))
                .catch(() => {});
        }
    }, [addLessonModalOpen, createQuizModalOpen]);

    // Nạp Bảng xếp hạng khi mở Tab Bảng xếp hạng
    useEffect(() => {
        if (activeTab === "leaderboard" && classroomId) {
            setLoadingLeaderboard(true);
            void fetchClassroomLeaderboard(classroomId)
                .then((data) => setLeaderboard(data || []))
                .catch((e) => console.warn("Lỗi nạp bảng xếp hạng:", e))
                .finally(() => setLoadingLeaderboard(false));
        }
    }, [activeTab, classroomId]);

    // Nạp Bảng tin khi mở Tab Bảng tin
    useEffect(() => {
        if (activeTab === "announcements" && classroomId) {
            setLoadingAnnouncements(true);
            void fetchAnnouncements(classroomId)
                .then((data) => setAnnouncements(data || []))
                .catch((e) => console.warn("Lỗi nạp bảng tin:", e))
                .finally(() => setLoadingAnnouncements(false));
        }
    }, [activeTab, classroomId]);

    const handleCopyCode = () => {
        if (!classroom?.code) return;
        void navigator.clipboard.writeText(classroom.code);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
    };

    const handleCopyLink = () => {
        if (!classroom?.code) return;
        const link = `${window.location.origin}/classrooms?join=${classroom.code}`;
        void navigator.clipboard.writeText(link);
        setCopiedLink(true);
        setActionMsg("Đã sao chép liên kết mời học viên vào bộ nhớ tạm!");
        setTimeout(() => {
            setCopiedLink(false);
            setActionMsg(null);
        }, 3000);
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editName.trim()) return;
        setSavingSettings(true);
        try {
            const updated = await updateClassroom(classroomId, {
                name: editName.trim(),
                description: editDesc.trim() || undefined,
                jlptLevel: editJlpt,
                privacy: editPrivacy,
                maxStudents: editMaxStudents,
            });
            setClassroom(updated);
            setSettingsModalOpen(false);
            setActionMsg("Đã cập nhật cài đặt lớp học thành công!");
            setTimeout(() => setActionMsg(null), 3000);
        } catch (err: any) {
            alert(err.message || "Không thể lưu cài đặt");
        } finally {
            setSavingSettings(false);
        }
    };

    const handleAddLesson = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLessonTitle.trim()) return;
        setSavingLesson(true);
        try {
            await addClassroomLesson(classroomId, {
                title: newLessonTitle.trim(),
                scheduledDate: newLessonDate || null,
                hasQuiz: newLessonHasQuiz,
                quizDurationMinutes: newLessonQuizDuration,
                deckIds: newLessonDeckIds,
            });
            setAddLessonModalOpen(false);
            setNewLessonTitle("");
            setNewLessonDate("");
            setNewLessonHasQuiz(false);
            setNewLessonDeckIds([]);
            setActionMsg("Đã thêm buổi học mới thành công!");
            void loadClassroom();
            setTimeout(() => setActionMsg(null), 3000);
        } catch (err: any) {
            alert(err.message || "Không thể thêm buổi học");
        } finally {
            setSavingLesson(false);
        }
    };

    const handleOpenSubmissions = async (lesson: ClassroomLesson) => {
        setSubmissionLesson(lesson);
        setLoadingSubmissions(true);
        try {
            const data = await fetchLessonSubmissions(classroomId, lesson.id);
            setSubmissions(data || []);
        } catch (err: any) {
            console.warn("Lỗi nạp submissions:", err);
            setSubmissions([]);
        } finally {
            setLoadingSubmissions(false);
        }
    };

    // Helper làm sạch tiêu đề buổi học, tránh lặp lại "Buổi X: Buổi X:..."
    const formatLessonLabel = (l: ClassroomLesson) => {
        const trimmed = (l.title || "").trim();
        const prefixRegex = new RegExp(`^Buổi\\s*${l.orderIndex}[:\\s-]*`, "i");
        if (prefixRegex.test(trimmed)) {
            return trimmed;
        }
        return `Buổi ${l.orderIndex}: ${trimmed}`;
    };

    // Helper trích xuất dải thẻ từ tiêu đề buổi học
    const extractLessonRange = (title?: string | null): { start: number; end: number; count: number } | null => {
        if (!title) return null;
        const m = title.match(/(\d+)\s*-\s*(\d+)/);
        if (!m) return null;
        const start = parseInt(m[1], 10);
        const end = parseInt(m[2], 10);
        if (isNaN(start) || isNaN(end) || start <= 0 || end < start) return null;
        return { start, end, count: end - start + 1 };
    };

    // Mở modal tạo bài kiểm tra riêng
    const handleOpenCreateQuizModal = (lesson?: ClassroomLesson) => {
        if (lesson) {
            setQuizLessonId(lesson.id);
            const range = extractLessonRange(lesson.title);
            const label = formatLessonLabel(lesson);
            setQuizTitle(`Kiểm tra 15 phút - ${label}`);
            setSelectedQuizDecks(lesson.deckIds ? [...lesson.deckIds] : []);

            if (range) {
                setQuizQuestionCount(Math.min(range.count, 30));
            } else {
                setQuizQuestionCount(30);
            }
        } else {
            setQuizLessonId(null);
            setQuizTitle("Bài kiểm tra trắc nghiệm tổng hợp (30 câu)");
            setSelectedQuizDecks([]);
            setQuizQuestionCount(30);
        }
        setQuizDescription("");
        setQuizDuration(15);
        setQuizDeckSearch("");
        setCreateQuizModalOpen(true);
    };

    // Khi người dùng thay đổi lựa chọn buổi học trong modal tạo quiz
    const handleSelectQuizLesson = (lessonIdVal: number | null) => {
        setQuizLessonId(lessonIdVal);
        if (lessonIdVal) {
            const les = lessons.find((l) => l.id === lessonIdVal);
            if (les) {
                setSelectedQuizDecks(les.deckIds ? [...les.deckIds] : []);
                const range = extractLessonRange(les.title);
                const label = formatLessonLabel(les);
                setQuizTitle(`Kiểm tra 15 phút - ${label}`);
                if (range) {
                    setQuizQuestionCount(Math.min(range.count, 30));
                } else {
                    setQuizQuestionCount(30);
                }
            }
        } else {
            setQuizTitle("Bài kiểm tra trắc nghiệm tổng hợp (30 câu)");
            setQuizQuestionCount(30);
        }
    };

    // Lưu tạo bài kiểm tra
    const handleSaveQuiz = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!quizTitle.trim()) {
            alert("Vui lòng nhập tiêu đề bài kiểm tra.");
            return;
        }
        if (selectedQuizDecks.length === 0) {
            alert("Vui lòng chọn ít nhất 1 bộ thẻ nguồn để tạo câu hỏi trắc nghiệm.");
            return;
        }

        // Tự động nhận diện dải thẻ nếu buổi học có băm thẻ
        let finalCardRange: string | undefined = undefined;
        if (quizLessonId) {
            const currentLesson = lessons.find((l) => l.id === quizLessonId);
            const currentLessonRange = extractLessonRange(currentLesson?.title);
            if (currentLessonRange) {
                finalCardRange = `${currentLessonRange.start}-${currentLessonRange.end}`;
            }
        }

        setSavingQuiz(true);
        try {
            const created = await createClassroomQuiz(classroomId, {
                lessonId: quizLessonId,
                title: quizTitle.trim(),
                description: quizDescription.trim() || undefined,
                durationMinutes: quizDuration,
                questionCount: quizQuestionCount,
                deckIds: selectedQuizDecks,
                cardRange: finalCardRange,
            });

            setQuizzes((prev) => [created, ...prev.filter((q) => q.id !== created.id)]);
            setCreateQuizModalOpen(false);
            setActionMsg(`Đã tạo bài kiểm tra "${created.title}" thành công!`);
            setTimeout(() => setActionMsg(null), 3000);
        } catch (err: any) {
            alert(err.response?.data?.message || err.message || "Không thể tạo bài kiểm tra");
        } finally {
            setSavingQuiz(false);
        }
    };

    // Xóa bài kiểm tra
    const handleDeleteQuiz = async (quizId: number, quizTitle: string) => {
        if (!window.confirm(`Bạn có chắc muốn xóa bài kiểm tra "${quizTitle}"?`)) return;
        try {
            await deleteClassroomQuiz(classroomId, quizId);
            setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
            setActionMsg("Đã xóa bài kiểm tra!");
            setTimeout(() => setActionMsg(null), 3000);
        } catch (err: any) {
            alert(err.response?.data?.message || err.message || "Không thể xóa bài kiểm tra");
        }
    };

    // Mở modal xem danh sách học sinh nộp bài thi (Giáo viên)
    const handleOpenQuizSubmissions = async (quiz: ClassroomQuiz) => {
        setViewingQuiz(quiz);
        setQuizSubmissionsModalOpen(true);
        setLoadingQuizSubmissions(true);
        try {
            const data = await fetchQuizSubmissions(classroomId, quiz.id);
            setQuizSubmissions(data || []);
        } catch (err: any) {
            console.warn("Lỗi nạp danh sách nộp bài quiz:", err);
            setQuizSubmissions([]);
        } finally {
            setLoadingQuizSubmissions(false);
        }
    };

    const handleCreateAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPostContent.trim()) return;
        setPosting(true);
        try {
            const post = await createAnnouncement(classroomId, {
                title: newPostTitle.trim() || undefined,
                content: newPostContent.trim(),
                isPinned: newPostPinned,
            });
            setAnnouncements((prev) => [post, ...prev]);
            setNewPostTitle("");
            setNewPostContent("");
            setNewPostPinned(false);
            setActionMsg("Đã đăng thông báo lên bảng tin!");
            setTimeout(() => setActionMsg(null), 3000);
        } catch (err: any) {
            alert(err.message || "Không thể đăng thông báo");
        } finally {
            setPosting(false);
        }
    };

    const handleDeleteAnnouncement = async (announcementId: number) => {
        if (!window.confirm("Bạn có chắc muốn xóa bài đăng này?")) return;
        try {
            await deleteAnnouncement(classroomId, announcementId);
            setAnnouncements((prev) => prev.filter((a) => a.id !== announcementId));
        } catch (err: any) {
            alert(err.message || "Không thể xóa bài");
        }
    };

    const handleSendComment = async (announcementId: number) => {
        const text = commentTexts[announcementId]?.trim();
        if (!text) return;
        setSendingComment((prev) => ({ ...prev, [announcementId]: true }));
        try {
            const cm = await addAnnouncementComment(classroomId, announcementId, text);
            setAnnouncements((prev) =>
                prev.map((a) => {
                    if (a.id === announcementId) {
                        return { ...a, comments: [...(a.comments || []), cm] };
                    }
                    return a;
                })
            );
            setCommentTexts((prev) => ({ ...prev, [announcementId]: "" }));
        } catch (err: any) {
            alert(err.message || "Không thể gửi bình luận");
        } finally {
            setSendingComment((prev) => ({ ...prev, [announcementId]: false }));
        }
    };

    const handleDeleteComment = async (announcementId: number, commentId: number) => {
        try {
            await deleteAnnouncementComment(classroomId, announcementId, commentId);
            setAnnouncements((prev) =>
                prev.map((a) => {
                    if (a.id === announcementId) {
                        return { ...a, comments: (a.comments || []).filter((c) => c.id !== commentId) };
                    }
                    return a;
                })
            );
        } catch (err: any) {
            alert(err.message || "Lỗi xóa bình luận");
        }
    };

    const handleApprove = async (userId: number) => {
        try {
            await approveMember(classroomId, userId);
            setActionMsg("Đã duyệt học viên vào lớp!");
            void loadClassroom();
            setTimeout(() => setActionMsg(null), 3000);
        } catch (err: any) {
            alert(err.message || "Lỗi duyệt học viên");
        }
    };

    const handleReject = async (userId: number) => {
        try {
            await rejectMember(classroomId, userId);
            setActionMsg("Đã từ chối yêu cầu.");
            void loadClassroom();
            setTimeout(() => setActionMsg(null), 3000);
        } catch (err: any) {
            alert(err.message || "Lỗi từ chối");
        }
    };

    const handleRemove = async (userId: number) => {
        if (!window.confirm("Bạn có chắc chắn muốn xóa học viên này khỏi lớp?")) return;
        try {
            await removeMember(classroomId, userId);
            setActionMsg("Đã xóa học viên khỏi lớp.");
            void loadClassroom();
            setTimeout(() => setActionMsg(null), 3000);
        } catch (err: any) {
            alert(err.message || "Lỗi xóa học viên");
        }
    };

    const getLessonStudyUrl = (deckId: string, title: string, lessonId: number) => {
        const queryParams = new URLSearchParams();
        const match = /Thẻ\s+(\d+)\s*-\s*(\d+)/i.exec(title);
        if (match) {
            queryParams.set("range", `${match[1]}-${match[2]}`);
        }
        queryParams.set("classroomId", String(classroomId));
        queryParams.set("lessonId", String(lessonId));
        return `/decks/${deckId}/study?${queryParams.toString()}`;
    };

    if (loading) {
        return (
            <div className="py-24 text-center text-slate-400 space-y-2">
                <span className="material-symbols-outlined text-[36px] animate-spin text-blue-600">sync</span>
                <p className="text-xs">Đang tải thông tin lớp học...</p>
            </div>
        );
    }

    if (error || !classroom) {
        return (
            <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
                <span className="material-symbols-outlined text-[48px] text-rose-500">error</span>
                <h2 className="text-lg font-bold text-slate-800">Không thể mở lớp học</h2>
                <p className="text-xs text-slate-600">{error || "Lớp học không tồn tại hoặc bạn chưa được cấp quyền."}</p>
                <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                        type="button"
                        onClick={() => void loadClassroom()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[16px]">refresh</span>
                        <span>Thử tải lại</span>
                    </button>
                    <Link
                        to="/classrooms"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
                    >
                        ← Về danh sách lớp
                    </Link>
                </div>
            </div>
        );
    }

    const lessons = classroom.lessons || [];
    const completedLessonsCount = lessons.filter((l) => l.isCompleted).length;
    const progressPercent = lessons.length > 0 ? Math.round((completedLessonsCount / lessons.length) * 100) : 0;

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center justify-between text-xs text-slate-500">
                <Link to="/classrooms" className="hover:text-blue-600 flex items-center gap-1 font-medium">
                    ← Danh sách lớp học
                </Link>
                {classroom.isOwner && (
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold border border-amber-200 shadow-2xs">
                            Chủ lớp / Giáo viên
                        </span>
                        <button
                            type="button"
                            onClick={() => setEditClassModalOpen(true)}
                            className="px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[15px]">edit_calendar</span>
                            <span>Chỉnh sửa lớp học</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Banner Lớp học */}
            <div className="p-6 rounded-3xl bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 text-white shadow-lg space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-lg bg-white/20 backdrop-blur-xs font-bold text-xs">
                                {classroom.jlptLevel || "N5"}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-lg bg-white/10 text-white/80 text-xs flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">
                                    {classroom.privacy === "PUBLIC" ? "public" : "lock"}
                                </span>
                                <span>{classroom.privacy === "PUBLIC" ? "Lớp công khai" : "Lớp riêng tư"}</span>
                            </span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">{classroom.name}</h1>
                        <p className="text-xs text-blue-100 max-w-2xl leading-relaxed">
                            {classroom.description || "Lớp học tiếng Nhật theo lộ trình."}
                        </p>
                        <div className="text-[11px] text-blue-200 flex items-center gap-2 pt-1">
                            <span>Giáo viên: <strong>{classroom.ownerName}</strong></span>
                            <span>·</span>
                            <span>Sĩ số: {classroom.memberCount} / {classroom.maxStudents} học viên</span>
                        </div>
                    </div>

                    {/* Hộp Mã tham gia & Hành động nhanh */}
                    <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/15 flex flex-col items-center justify-center min-w-[220px] shrink-0 space-y-2.5">
                        <span className="text-[11px] font-bold text-blue-200 uppercase tracking-wider">Mã tham gia lớp</span>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-2xl font-black tracking-widest text-white">{classroom.code}</span>
                            <button
                                type="button"
                                onClick={handleCopyCode}
                                className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
                                title="Sao chép mã lớp"
                            >
                                <span className="material-symbols-outlined text-[16px]">
                                    {copiedCode ? "check" : "content_copy"}
                                </span>
                            </button>
                        </div>
                        <div className="flex items-center gap-2 pt-1 w-full">
                            <button
                                type="button"
                                onClick={handleCopyLink}
                                className="flex-1 py-1.5 px-2 rounded-xl bg-blue-500/40 hover:bg-blue-500/60 text-white font-semibold text-[11px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[14px]">
                                    {copiedLink ? "done" : "link"}
                                </span>
                                <span>{copiedLink ? "Đã chép link" : "Copy link mời"}</span>
                            </button>
                            {classroom.isOwner && (
                                <button
                                    type="button"
                                    onClick={() => setSettingsModalOpen(true)}
                                    className="p-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
                                    title="Cài đặt lớp học"
                                >
                                    <span className="material-symbols-outlined text-[16px]">settings</span>
                                </button>
                            )}
                        </div>

                        {classroom.isOwner && (
                            <button
                                type="button"
                                onClick={() => setEditClassModalOpen(true)}
                                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[16px]">edit_calendar</span>
                                <span>Chỉnh sửa lớp học</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Thông báo hành động */}
            {actionMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-2xs">
                    <span>{actionMsg}</span>
                    <button type="button" onClick={() => setActionMsg(null)} className="font-bold text-emerald-700">✕</button>
                </div>
            )}

            {/* Thanh tiến độ học tập cá nhân của học sinh */}
            {!classroom.isOwner && lessons.length > 0 && (
                <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[18px] text-emerald-600">verified</span>
                            <span>Tiến độ học tập của bạn:</span>
                        </span>
                        <span className="font-bold text-emerald-600">
                            {completedLessonsCount} / {lessons.length} buổi ({progressPercent}%)
                        </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200">
                <button
                    type="button"
                    onClick={() => setActiveTab("lessons")}
                    className={`py-3 px-4 font-semibold text-xs border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === "lessons"
                            ? "border-blue-600 text-blue-600"
                            : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                >
                    <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                    <span>Lộ trình buổi học ({lessons.length})</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab("members")}
                    className={`py-3 px-4 font-semibold text-xs border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === "members"
                            ? "border-blue-600 text-blue-600"
                            : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                >
                    <span className="material-symbols-outlined text-[18px]">group</span>
                    <span>Học viên ({approvedMembers.length})</span>
                    {classroom.isOwner && pendingMembers.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-bold text-[10px]">
                            {pendingMembers.length}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab("leaderboard")}
                    className={`py-3 px-4 font-semibold text-xs border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === "leaderboard"
                            ? "border-blue-600 text-blue-600"
                            : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                >
                    <span className="material-symbols-outlined text-[18px]">leaderboard</span>
                    <span>Bảng xếp hạng</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab("announcements")}
                    className={`py-3 px-4 font-semibold text-xs border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === "announcements"
                            ? "border-blue-600 text-blue-600"
                            : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                >
                    <span className="material-symbols-outlined text-[18px]">campaign</span>
                    <span>Bảng tin</span>
                </button>
            </div>

            {/* TAB 1: LỘ TRÌNH BUỔI HỌC */}
            {activeTab === "lessons" && (
                <div className="space-y-4">
                    {/* Header tác vụ tab lộ trình */}
                    {classroom.isOwner && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50/60 p-3 px-4 rounded-2xl border border-blue-100">
                            <span className="text-xs text-blue-900 font-medium">
                                Bạn là giáo viên. Bạn có thể thêm buổi học, tạo bài kiểm tra riêng (30 câu) hoặc theo dõi tiến độ.
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => handleOpenCreateQuizModal()}
                                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[16px]">quiz</span>
                                    <span>Tạo bài kiểm tra</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAddLessonModalOpen(true)}
                                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[16px]">add</span>
                                    <span>Thêm buổi học mới</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* BÀI KIỂM TRA CHUNG CỦA LỚP (KHÔNG GẮN BUỔI LẺ / THI TỔNG HỢP) */}
                    {quizzes.filter((q) => !q.lessonId).length > 0 && (
                        <div className="p-4 rounded-3xl bg-gradient-to-r from-purple-50/90 via-indigo-50/40 to-white border border-purple-200/90 shadow-2xs space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center">
                                        <span className="material-symbols-outlined text-[16px]">assignment</span>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                                            Bài kiểm tra chung của lớp ({quizzes.filter((q) => !q.lessonId).length} bài thi)
                                        </h3>
                                        <p className="text-[10px] text-slate-500">
                                            Bài thi tổng hợp / định kỳ dành cho toàn bộ học viên trong lớp
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2.5">
                                {quizzes
                                    .filter((q) => !q.lessonId)
                                    .map((quiz) => (
                                        <div
                                            key={quiz.id}
                                            className="p-3.5 rounded-2xl bg-white border border-purple-100 hover:border-purple-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold shrink-0">
                                                    <span className="material-symbols-outlined text-[18px]">quiz</span>
                                                </div>
                                                <div className="space-y-0.5">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h4 className="font-bold text-slate-900 text-xs">{quiz.title}</h4>
                                                        <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-semibold text-[10px] border border-purple-200">
                                                            {quiz.questionCount} câu ngẫu nhiên · {quiz.durationMinutes} phút
                                                        </span>
                                                    </div>
                                                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                                        <span>{quiz.deckIds.length} bộ thẻ nguồn</span>
                                                        {quiz.myLatestScore !== null && quiz.myLatestScore !== undefined ? (
                                                            <span className="font-bold text-emerald-600 flex items-center gap-0.5">
                                                                · <span className="material-symbols-outlined text-[13px]">stars</span>
                                                                Điểm của bạn: {quiz.myLatestScore}/100
                                                            </span>
                                                        ) : (
                                                            <span>· Chưa làm bài</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 self-end sm:self-center">
                                                {classroom.isOwner && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenQuizSubmissions(quiz)}
                                                        className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-xs border border-purple-200 transition-colors cursor-pointer flex items-center gap-1"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">groups</span>
                                                        <span>{quiz.submissionCount} bạn đã nộp</span>
                                                    </button>
                                                )}

                                                <Link
                                                    to={`/classrooms/${classroomId}/quizzes/${quiz.id}`}
                                                    className={`px-4 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs ${
                                                        quiz.myLatestScore !== null && quiz.myLatestScore !== undefined
                                                            ? "bg-purple-100 hover:bg-purple-200 text-purple-800"
                                                            : "bg-purple-600 hover:bg-purple-700 text-white"
                                                    }`}
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">
                                                        {quiz.myLatestScore !== null ? "replay" : "play_arrow"}
                                                    </span>
                                                    <span>{quiz.myLatestScore !== null ? "Làm lại bài thi" : "Làm bài thi ngay"}</span>
                                                </Link>

                                                {classroom.isOwner && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteQuiz(quiz.id, quiz.title)}
                                                        className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                                        title="Xóa bài thi này"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">delete</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}

                    {lessons.length === 0 ? (
                        <div className="py-16 text-center rounded-2xl bg-white border border-slate-200 p-6 space-y-2">
                            <span className="material-symbols-outlined text-[32px] text-slate-400">event_busy</span>
                            <p className="text-sm font-semibold text-slate-700">Chưa có buổi học nào trong lớp</p>
                            <p className="text-xs text-slate-400">Giáo viên sẽ sớm thêm các buổi học và bài tập vào đây.</p>
                        </div>
                    ) : (
                        lessons.map((lesson) => {
                            const lessonQuiz = quizzes.find((q) => q.lessonId === lesson.id);
                            return (
                                <div
                                    key={lesson.id}
                                    className={`p-4 rounded-2xl bg-white border transition-all space-y-3 ${
                                        lesson.isCompleted
                                            ? "border-emerald-200 bg-emerald-50/15 shadow-2xs"
                                            : "border-slate-200 hover:border-blue-300 hover:shadow-xs"
                                    }`}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-start gap-3.5">
                                            <div
                                                className={`w-10 h-10 rounded-xl font-bold flex items-center justify-center text-sm shrink-0 ${
                                                    lesson.isCompleted
                                                        ? "bg-emerald-600 text-white shadow-xs"
                                                        : "bg-blue-50 text-blue-700"
                                                }`}
                                            >
                                                {lesson.isCompleted ? (
                                                    <span className="material-symbols-outlined text-[20px]">check</span>
                                                ) : (
                                                    lesson.orderIndex
                                                )}
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h4 className="font-bold text-slate-900 text-sm">{lesson.title}</h4>
                                                    {lesson.isCompleted && (
                                                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200 flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                                            <span>Đã hoàn thành</span>
                                                        </span>
                                                    )}
                                                    {lessonQuiz && (
                                                        <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-semibold text-[10px] border border-purple-200/60 flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-[12px]">quiz</span>
                                                            <span>Quiz {lessonQuiz.questionCount} câu ({lessonQuiz.durationMinutes}p)</span>
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3">
                                                    {lesson.scheduledDate && (
                                                        <span>Ngày: {lesson.scheduledDate}</span>
                                                    )}
                                                    <span>
                                                        {lesson.deckIds && lesson.deckIds.length > 0
                                                            ? `${lesson.deckIds.length} bộ thẻ gán kèm`
                                                            : "Chưa gán bộ thẻ"}
                                                    </span>
                                                    {classroom.isOwner && (
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleOpenSubmissions(lesson)}
                                                            className="font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md border border-blue-200 flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                                                            title="Bấm để xem danh sách học viên hoàn thành"
                                                        >
                                                            <span className="material-symbols-outlined text-[13px]">group</span>
                                                            <span>{lesson.completedMembersCount || 0} / {classroom.memberCount} bạn xong bài</span>
                                                            <span className="material-symbols-outlined text-[11px]">arrow_forward</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                                            {lesson.deckIds && lesson.deckIds.length === 1 && (
                                                <Link
                                                    to={getLessonStudyUrl(lesson.deckIds[0], lesson.title, lesson.id)}
                                                    className={`px-4 py-2 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all shadow-2xs ${
                                                        lesson.isCompleted
                                                            ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300"
                                                            : "bg-blue-600 hover:bg-blue-700 text-white"
                                                    }`}
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">
                                                        {lesson.isCompleted ? "replay" : "play_arrow"}
                                                    </span>
                                                    <span>{lesson.isCompleted ? "Ôn lại bài" : "Học ngay"}</span>
                                                </Link>
                                            )}
                                            {lesson.deckIds && lesson.deckIds.length > 1 && (
                                                <div className="flex items-center gap-1.5">
                                                    {lesson.deckIds.map((did, didx) => (
                                                        <Link
                                                            key={did}
                                                            to={getLessonStudyUrl(did, lesson.title, lesson.id)}
                                                            className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1 border transition-colors ${
                                                                lesson.isCompleted
                                                                    ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300"
                                                                    : "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                                                            }`}
                                                        >
                                                            <span className="material-symbols-outlined text-[14px]">
                                                                {lesson.isCompleted ? "replay" : "play_arrow"}
                                                            </span>
                                                            <span>{lesson.isCompleted ? `Ôn phần ${didx + 1}` : `Học phần ${didx + 1}`}</span>
                                                        </Link>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* KHỐI BÀI KIỂM TRA RIÊNG CỦA BUỔI HỌC */}
                                    {lessonQuiz ? (
                                        <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-purple-50/50 p-3 rounded-xl border border-purple-100/80">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold shrink-0">
                                                    <span className="material-symbols-outlined text-[18px]">quiz</span>
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-xs text-purple-950">{lessonQuiz.title}</span>
                                                        <span className="text-[10px] text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md font-semibold">
                                                            {lessonQuiz.questionCount} câu ngẫu nhiên · {lessonQuiz.durationMinutes}p
                                                        </span>
                                                    </div>
                                                    {lessonQuiz.myLatestScore !== null && lessonQuiz.myLatestScore !== undefined ? (
                                                        <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 mt-0.5">
                                                            <span className="material-symbols-outlined text-[14px]">stars</span>
                                                            <span>Điểm bài kiểm tra của bạn: {lessonQuiz.myLatestScore}/100</span>
                                                        </div>
                                                    ) : (
                                                        <div className="text-[11px] text-slate-400 mt-0.5">
                                                            Chưa hoàn thành bài kiểm tra
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {classroom.isOwner && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenQuizSubmissions(lessonQuiz)}
                                                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-purple-50 text-purple-700 font-semibold text-xs border border-purple-200 shadow-2xs flex items-center gap-1 cursor-pointer transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">groups</span>
                                                        <span>{lessonQuiz.submissionCount} bạn đã nộp bài</span>
                                                    </button>
                                                )}

                                                <Link
                                                    to={`/classrooms/${classroomId}/quizzes/${lessonQuiz.id}`}
                                                    className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all ${
                                                        lessonQuiz.myLatestScore !== null && lessonQuiz.myLatestScore !== undefined
                                                            ? "bg-purple-100 hover:bg-purple-200 text-purple-800"
                                                            : "bg-purple-600 hover:bg-purple-700 text-white"
                                                    }`}
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">
                                                        {lessonQuiz.myLatestScore !== null ? "replay" : "play_arrow"}
                                                    </span>
                                                    <span>
                                                        {lessonQuiz.myLatestScore !== null ? "Làm lại bài thi" : "Làm kiểm tra ngay"}
                                                    </span>
                                                </Link>

                                                {classroom.isOwner && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteQuiz(lessonQuiz.id, lessonQuiz.title)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                                        title="Xóa bài kiểm tra này"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">delete</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ) : classroom.isOwner ? (
                                        <div className="pt-2 border-t border-dashed border-slate-100 flex items-center justify-between text-xs">
                                            <span className="text-[11px] text-slate-400">Buổi này chưa có bài kiểm tra</span>
                                            <button
                                                type="button"
                                                onClick={() => handleOpenCreateQuizModal(lesson)}
                                                className="text-[11px] font-semibold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-md border border-purple-200 flex items-center gap-1 cursor-pointer transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-[13px]">add</span>
                                                <span>Tạo bài kiểm tra (30 câu)</span>
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* TAB 2: QUẢN LÝ HỌC VIÊN */}
            {activeTab === "members" && (
                <div className="space-y-6">
                    {/* Hàng đợi chờ duyệt */}
                    {classroom.isOwner && pendingMembers.length > 0 && (
                        <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-amber-900 text-xs flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[18px] text-amber-600">person_add</span>
                                    <span>Yêu cầu tham gia lớp đang chờ duyệt ({pendingMembers.length})</span>
                                </h3>
                            </div>

                            <div className="divide-y divide-amber-200/60 bg-white rounded-xl border border-amber-200/80 overflow-hidden">
                                {pendingMembers.map((m) => (
                                    <div key={m.userId} className="p-3 flex items-center justify-between gap-3 text-xs">
                                        <div>
                                            <span className="font-bold text-slate-900 block">{m.fullName}</span>
                                            <span className="text-slate-500 text-[11px]">{m.email}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleApprove(m.userId)}
                                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">check</span>
                                                <span>Duyệt</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleReject(m.userId)}
                                                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                                            >
                                                Từ chối
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Danh sách học viên chính thức */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-bold text-slate-800 text-xs">Danh sách học viên ({approvedMembers.length})</h3>
                        </div>

                        {approvedMembers.length === 0 ? (
                            <div className="py-12 text-center text-slate-400 text-xs">Chưa có học viên nào trong lớp.</div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {approvedMembers.map((m) => {
                                    const completedCount = m.completedLessonsCount || 0;
                                    const pct = lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0;
                                    return (
                                        <div key={m.userId} className="p-3.5 px-4 flex items-center justify-between gap-3 text-xs">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center text-xs">
                                                    {m.fullName.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-semibold text-slate-900">{m.fullName}</span>
                                                        {m.role === "TEACHER" && (
                                                            <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 font-bold text-[10px]">
                                                                Giáo viên
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-slate-400 text-[11px] mt-0.5">
                                                        <span>{m.email}</span>
                                                        {m.role !== "TEACHER" && (
                                                            <>
                                                                <span>·</span>
                                                                <span className="text-emerald-600 font-medium">
                                                                    Đã học: {completedCount} / {lessons.length} buổi ({pct}%)
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {classroom.isOwner && m.role !== "TEACHER" && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemove(m.userId)}
                                                    className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                                    title="Xóa học viên khỏi lớp"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">person_remove</span>
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 3: BẢNG XẾP HẠNG THÀNH TÍCH LỚP HỌC */}
            {activeTab === "leaderboard" && (
                <div className="space-y-4">
                    {/* Báo cáo tổng quan thành tích lớp */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-4 rounded-2xl bg-white border border-slate-200 text-center space-y-1">
                            <span className="text-slate-400 text-[11px]">Tổng số buổi học</span>
                            <div className="text-xl font-bold text-slate-800">{lessons.length} buổi</div>
                        </div>
                        <div className="p-4 rounded-2xl bg-white border border-slate-200 text-center space-y-1">
                            <span className="text-slate-400 text-[11px]">Tổng số bài kiểm tra</span>
                            <div className="text-xl font-bold text-purple-600">{quizzes.length} bài thi</div>
                        </div>
                        <div className="p-4 rounded-2xl bg-white border border-slate-200 text-center space-y-1">
                            <span className="text-slate-400 text-[11px]">Tổng số học viên</span>
                            <div className="text-xl font-bold text-blue-600">{approvedMembers.length} bạn</div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[18px] text-amber-500">emoji_events</span>
                                    <span>Bảng vinh danh học tập & Điểm kiểm tra</span>
                                </h3>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                    Xếp hạng ưu tiên theo Điểm trung bình Quiz và Số buổi học đã hoàn thành
                                </p>
                            </div>
                            <span className="text-xs font-semibold text-slate-500">
                                {leaderboard.length || approvedMembers.length} học viên
                            </span>
                        </div>

                        {loadingLeaderboard ? (
                            <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                <span>Đang nạp bảng xếp hạng...</span>
                            </div>
                        ) : leaderboard.length === 0 ? (
                            <div className="py-12 text-center text-slate-400 text-xs">Chưa có dữ liệu thành tích học viên.</div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {leaderboard.map((m) => {
                                    const pct = lessons.length > 0 ? Math.round((m.completedLessonsCount / lessons.length) * 100) : 0;
                                    return (
                                        <div key={m.userId} className="p-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                                            <div className="flex items-center gap-3.5">
                                                <div className="w-8 flex items-center justify-center font-black text-sm shrink-0">
                                                    {m.rank === 1 ? "🥇" : m.rank === 2 ? "🥈" : m.rank === 3 ? "🥉" : `#${m.rank}`}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-bold text-slate-900">{m.fullName}</span>
                                                    </div>
                                                    <span className="text-slate-400 text-[11px]">{m.email}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-6 justify-between sm:justify-end">
                                                {/* Điểm Quiz */}
                                                <div className="text-left sm:text-right">
                                                    <div className="font-bold text-purple-700 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[15px] text-amber-500">stars</span>
                                                        <span>{m.averageQuizScore > 0 ? `${m.averageQuizScore} đ` : "Chưa làm Quiz"}</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">
                                                        {m.quizzesTakenCount} bài kiểm tra đã nộp
                                                    </div>
                                                </div>

                                                {/* Tiến độ buổi học */}
                                                <div className="text-right space-y-1">
                                                    <div className="font-bold text-emerald-600 text-xs">
                                                        {m.completedLessonsCount} / {lessons.length} buổi ({pct}%)
                                                    </div>
                                                    <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden ml-auto">
                                                        <div
                                                            className="h-full bg-emerald-500 rounded-full"
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 4: BẢNG TIN LỚP HỌC (ANNOUNCEMENTS & COMMENTS) */}
            {activeTab === "announcements" && (
                <div className="space-y-4">
                    {/* Form đăng bài (Giáo viên) */}
                    {classroom.isOwner && (
                        <form
                            onSubmit={handleCreateAnnouncement}
                            className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3 text-xs"
                        >
                            <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[18px] text-blue-600">edit_note</span>
                                <span>Đăng thông báo dặn dò cho lớp</span>
                            </div>
                            <input
                                type="text"
                                value={newPostTitle}
                                onChange={(e) => setNewPostTitle(e.target.value)}
                                placeholder="Tiêu đề thông báo (ví dụ: Nhắc nhở ôn tập trợ từ buổi 3...)"
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-slate-900"
                            />
                            <textarea
                                required
                                rows={3}
                                value={newPostContent}
                                onChange={(e) => setNewPostContent(e.target.value)}
                                placeholder="Nhập nội dung dặn dò, lưu ý làm bài hoặc link tài liệu học tập..."
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-slate-900 resize-none"
                            />
                            <div className="flex items-center justify-between pt-1">
                                <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer select-none text-[11px]">
                                    <input
                                        type="checkbox"
                                        checked={newPostPinned}
                                        onChange={(e) => setNewPostPinned(e.target.checked)}
                                        className="w-3.5 h-3.5 accent-blue-600 rounded"
                                    />
                                    <span>Ghim lên đầu bảng tin</span>
                                </label>
                                <button
                                    type="submit"
                                    disabled={posting || !newPostContent.trim()}
                                    className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[15px]">send</span>
                                    <span>{posting ? "Đang đăng..." : "Đăng thông báo"}</span>
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Danh sách thông báo */}
                    {loadingAnnouncements ? (
                        <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                            <span className="material-symbols-outlined text-[32px] animate-spin text-blue-600">sync</span>
                            <p>Đang tải bảng tin...</p>
                        </div>
                    ) : announcements.length === 0 ? (
                        <div className="py-12 text-center rounded-2xl bg-white border border-slate-200 text-slate-400 text-xs space-y-2">
                            <span className="material-symbols-outlined text-[32px] text-slate-300">campaign</span>
                            <p className="font-semibold text-slate-600">Bảng tin lớp học đang trống</p>
                            <p className="text-[11px]">Giáo viên có thể đăng các dặn dò và tài liệu tại đây.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {announcements.map((post) => (
                                <div
                                    key={post.id}
                                    className={`p-4 rounded-2xl bg-white border shadow-2xs space-y-3 ${
                                        post.isPinned ? "border-amber-300 bg-amber-50/10" : "border-slate-200"
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                                                {post.authorName.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-bold text-slate-900 text-xs">{post.authorName}</span>
                                                    {post.isPinned && (
                                                        <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-700 font-bold text-[10px] flex items-center gap-0.5">
                                                            <span className="material-symbols-outlined text-[11px]">keep</span>
                                                            <span>Đã ghim</span>
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-slate-400 text-[10px]">
                                                    {new Date(post.createdAt).toLocaleString("vi-VN")}
                                                </span>
                                            </div>
                                        </div>

                                        {classroom.isOwner && (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteAnnouncement(post.id)}
                                                className="text-slate-300 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                                                title="Xóa bài đăng này"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                            </button>
                                        )}
                                    </div>

                                    {post.title && <h4 className="font-bold text-slate-900 text-sm">{post.title}</h4>}
                                    <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">{post.content}</p>

                                    {/* Khu vực bình luận */}
                                    <div className="pt-3 border-t border-slate-100 space-y-2.5">
                                        <div className="text-[11px] font-semibold text-slate-500">
                                            Bình luận ({post.comments?.length || 0}):
                                        </div>

                                        {post.comments && post.comments.length > 0 && (
                                            <div className="space-y-2">
                                                {post.comments.map((cm) => (
                                                    <div key={cm.id} className="p-2.5 rounded-xl bg-slate-50 flex items-start justify-between gap-2 text-xs">
                                                        <div>
                                                            <span className="font-bold text-slate-900 mr-2 text-[11px]">{cm.userName}:</span>
                                                            <span className="text-slate-700 text-xs">{cm.content}</span>
                                                            <span className="text-slate-400 text-[10px] block mt-0.5">
                                                                {new Date(cm.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                                                            </span>
                                                        </div>
                                                        {classroom.isOwner && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteComment(post.id, cm.id)}
                                                                className="text-slate-300 hover:text-rose-600 transition-colors"
                                                            >
                                                                ✕
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Ô nhập bình luận */}
                                        <div className="flex items-center gap-2 pt-1">
                                            <input
                                                type="text"
                                                value={commentTexts[post.id] || ""}
                                                onChange={(e) => setCommentTexts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        void handleSendComment(post.id);
                                                    }
                                                }}
                                                placeholder="Viết bình luận hoặc đặt câu hỏi..."
                                                className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs outline-none focus:border-blue-500 bg-white"
                                            />
                                            <button
                                                type="button"
                                                disabled={sendingComment[post.id] || !commentTexts[post.id]?.trim()}
                                                onClick={() => void handleSendComment(post.id)}
                                                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs transition-colors cursor-pointer"
                                            >
                                                Gửi
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* MODAL 1: CÀI ĐẶT LỚP HỌC (Chỉ giáo viên) */}
            <Modal
                isOpen={settingsModalOpen}
                onClose={() => setSettingsModalOpen(false)}
                title="Cài đặt lớp học"
                icon="settings"
                size="md"
            >
                <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
                    <div>
                        <label className="block font-semibold text-slate-800 mb-1">Tên lớp học (*)</label>
                        <input
                            type="text"
                            required
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none focus:border-blue-500 text-slate-900 text-sm"
                        />
                    </div>

                    <div>
                        <label className="block font-semibold text-slate-800 mb-1">Cấp độ JLPT</label>
                        <div className="flex gap-1.5">
                            {JLPT_LEVELS.map((lvl) => (
                                <button
                                    key={lvl}
                                    type="button"
                                    onClick={() => setEditJlpt(lvl)}
                                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                                        editJlpt === lvl
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
                        <label className="block font-semibold text-slate-800 mb-1">Mô tả lớp học</label>
                        <textarea
                            rows={3}
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none focus:border-blue-500 text-slate-900 resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block font-semibold text-slate-800 mb-1">Chế độ tham gia</label>
                            <select
                                value={editPrivacy}
                                onChange={(e) => setEditPrivacy(e.target.value as any)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                            >
                                <option value="PRIVATE">Riêng tư (cần duyệt)</option>
                                <option value="PUBLIC">Công khai (vào thẳng)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block font-semibold text-slate-800 mb-1">Sĩ số tối đa</label>
                            <input
                                type="number"
                                min={5}
                                max={200}
                                value={editMaxStudents}
                                onChange={(e) => setEditMaxStudents(Number(e.target.value))}
                                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={() => setSettingsModalOpen(false)}
                            className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium"
                        >
                            Hủy bỏ
                        </button>
                        <button
                            type="submit"
                            disabled={savingSettings}
                            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                        >
                            <span>{savingSettings ? "Đang lưu..." : "Lưu thay đổi"}</span>
                        </button>
                    </div>
                </form>
            </Modal>

            {/* MODAL 2: THÊM BUỔI HỌC MỚI (Chỉ giáo viên) */}
            <Modal
                isOpen={addLessonModalOpen}
                onClose={() => setAddLessonModalOpen(false)}
                title="Thêm buổi học mới vào lớp"
                icon="add_circle"
                size="lg"
            >
                <form onSubmit={handleAddLesson} className="space-y-4 text-xs">
                    <div>
                        <label className="block font-semibold text-slate-800 mb-1">Tiêu đề buổi học (*)</label>
                        <input
                            type="text"
                            required
                            value={newLessonTitle}
                            onChange={(e) => setNewLessonTitle(e.target.value)}
                            placeholder="Ví dụ: Buổi 7: Luyện đề JLPT N3 & Kanji chuyên sâu"
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none focus:border-blue-500 text-slate-900 text-sm"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block font-semibold text-slate-800 mb-1">Ngày học (Tùy chọn)</label>
                            <input
                                type="date"
                                value={newLessonDate}
                                onChange={(e) => setNewLessonDate(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                            />
                        </div>
                        <div>
                            <label className="block font-semibold text-slate-800 mb-1">Bài kiểm tra Quiz</label>
                            <div className="flex items-center gap-3 pt-1.5">
                                <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                                    <input
                                        type="checkbox"
                                        checked={newLessonHasQuiz}
                                        onChange={(e) => setNewLessonHasQuiz(e.target.checked)}
                                        className="w-4 h-4 accent-blue-600 rounded"
                                    />
                                    <span>Kèm bài Quiz</span>
                                </label>
                                {newLessonHasQuiz && (
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            min={5}
                                            max={60}
                                            value={newLessonQuizDuration}
                                            onChange={(e) => setNewLessonQuizDuration(Number(e.target.value))}
                                            className="w-14 px-2 py-1 rounded-lg border border-slate-300 text-center text-xs"
                                        />
                                        <span>phút</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Chọn bộ thẻ gán vào buổi */}
                    <div>
                        <label className="block font-semibold text-slate-800 mb-1">
                            Chọn bộ thẻ gán vào buổi này ({newLessonDeckIds.length} bộ đã chọn)
                        </label>
                        <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 p-1">
                            {myDecks.length === 0 ? (
                                <div className="py-6 text-center text-slate-400 text-xs">Chưa có bộ thẻ nào.</div>
                            ) : (
                                myDecks.map((d) => {
                                    const selected = newLessonDeckIds.includes(d.id);
                                    return (
                                        <label
                                            key={d.id}
                                            className={`p-2.5 rounded-lg flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                                                selected ? "bg-blue-50 text-blue-900 font-bold" : "hover:bg-slate-50 text-slate-700"
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() => {
                                                        setNewLessonDeckIds((prev) =>
                                                            selected ? prev.filter((id) => id !== d.id) : [...prev, d.id]
                                                        );
                                                    }}
                                                    className="w-3.5 h-3.5 accent-blue-600 rounded"
                                                />
                                                <span className="text-xs">{d.title}</span>
                                            </div>
                                            <span className="text-[11px] text-slate-400 font-normal">
                                                {d.cards?.length || 0} thẻ
                                            </span>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={() => setAddLessonModalOpen(false)}
                            className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium"
                        >
                            Hủy bỏ
                        </button>
                        <button
                            type="submit"
                            disabled={savingLesson || !newLessonTitle.trim()}
                            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                        >
                            <span>{savingLesson ? "Đang thêm..." : "+ Thêm buổi học"}</span>
                        </button>
                    </div>
                </form>
            </Modal>

            {/* MODAL 3: XEM CHI TIẾT HỌC VIÊN NỘP BÀI / HOÀN THÀNH (Chỉ giáo viên) */}
            <Modal
                isOpen={submissionLesson !== null}
                onClose={() => setSubmissionLesson(null)}
                title={`Danh sách nộp bài - ${submissionLesson?.title || "Buổi học"}`}
                icon="assignment_turned_in"
                size="lg"
            >
                <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between text-slate-600 pb-1">
                        <span>
                            Đã hoàn thành:{" "}
                            <strong className="text-emerald-600">
                                {submissions.filter((s) => s.isCompleted).length} / {submissions.length} học viên
                            </strong>
                        </span>
                    </div>

                    {loadingSubmissions ? (
                        <div className="py-12 text-center text-slate-400 space-y-2">
                            <span className="material-symbols-outlined text-[32px] animate-spin text-blue-600">sync</span>
                            <p>Đang tải danh sách học viên...</p>
                        </div>
                    ) : submissions.length === 0 ? (
                        <div className="py-8 text-center text-slate-400">Chưa có học viên nào trong lớp.</div>
                    ) : (
                        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                            {submissions.map((s) => (
                                <div key={s.userId} className="p-3 px-4 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                                                s.isCompleted
                                                    ? "bg-emerald-100 text-emerald-700"
                                                    : "bg-slate-100 text-slate-500"
                                            }`}
                                        >
                                            {s.fullName.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <span className="font-bold text-slate-900 block">{s.fullName}</span>
                                            <span className="text-slate-400 text-[11px]">{s.email}</span>
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        {s.isCompleted ? (
                                            <div>
                                                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200 inline-flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[12px]">check</span>
                                                    <span>Đã hoàn thành</span>
                                                </span>
                                                {s.completedAt && (
                                                    <span className="block text-[10px] text-slate-400 mt-0.5">
                                                        {new Date(s.completedAt).toLocaleString("vi-VN")}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium text-[10px]">
                                                Chưa học
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex justify-end pt-2">
                        <button
                            type="button"
                            onClick={() => setSubmissionLesson(null)}
                            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
                        >
                            Đóng lại
                        </button>
                    </div>
                </div>
            </Modal>

            {/* MODAL 4: TẠO BÀI KIỂM TRA RIÊNG (GIÁO VIÊN) */}
            <Modal
                isOpen={createQuizModalOpen}
                onClose={() => setCreateQuizModalOpen(false)}
                title="Tạo bài kiểm tra riêng cho Lớp học"
            >
                <form onSubmit={handleSaveQuiz} className="space-y-4 text-xs">
                    <div>
                        <label className="block font-bold text-slate-700 mb-1">
                            Tiêu đề bài kiểm tra <span className="text-rose-500">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            value={quizTitle}
                            onChange={(e) => setQuizTitle(e.target.value)}
                            placeholder="Ví dụ: Kiểm tra 15 phút - Buổi 1: Từ vựng N3"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-purple-500 text-xs"
                        />
                    </div>

                    {/* Gắn vào Buổi học */}
                    <div>
                        <label className="block font-bold text-slate-700 mb-1">Gắn vào Buổi học</label>
                        <select
                            value={quizLessonId ?? ""}
                            onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : null;
                                handleSelectQuizLesson(val);
                            }}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-purple-500 text-xs bg-white cursor-pointer"
                        >
                            <option value="">🌐 (Bài kiểm tra chung của lớp - Không gắn vào buổi lẻ)</option>
                            {lessons.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {formatLessonLabel(l)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* THÔNG TIN PHẠM VI BỐC CÂU HỎI TỰ ĐỘNG */}
                    {(() => {
                        const currentLesson = lessons.find((l) => l.id === quizLessonId);
                        const lessonRange = extractLessonRange(currentLesson?.title);
                        const totalCardsInDecks = myDecks
                            .filter((d) => selectedQuizDecks.includes(d.id))
                            .reduce((sum, d) => sum + (d.cards?.length || 0), 0);

                        return (
                            <div className="p-3 rounded-2xl bg-purple-50/70 border border-purple-200/80 text-xs flex items-start gap-2.5">
                                <span className="material-symbols-outlined text-[18px] text-purple-600 shrink-0 mt-0.5">
                                    {lessonRange ? "lock" : "auto_awesome"}
                                </span>
                                <div className="space-y-0.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-bold text-slate-900">
                                            {lessonRange
                                                ? `Phạm vi: Tự động theo Buổi học (Thẻ ${lessonRange.start} → ${lessonRange.end})`
                                                : "Phạm vi: Bốc ngẫu nhiên từ toàn bộ các bộ thẻ nguồn"}
                                        </span>
                                        <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold text-[10px]">
                                            {lessonRange ? `${lessonRange.count} thẻ` : `${totalCardsInDecks} thẻ`}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500">
                                        {lessonRange
                                            ? "Hệ thống tự động khóa đề thi chỉ bốc câu hỏi trong các thẻ đã học ở buổi này, không bị lẫn sang buổi khác."
                                            : "Hệ thống sẽ bốc ngẫu nhiên câu hỏi từ các bộ thẻ bạn tick chọn bên dưới."}
                                    </p>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Cài đặt số câu hỏi & thời gian */}
                    {(() => {
                        const currentLesson = lessons.find((l) => l.id === quizLessonId);
                        const lessonRange = extractLessonRange(currentLesson?.title);
                        const totalCardsInDecks = myDecks
                            .filter((d) => selectedQuizDecks.includes(d.id))
                            .reduce((sum, d) => sum + (d.cards?.length || 0), 0);

                        const availableInScope = lessonRange ? lessonRange.count : totalCardsInDecks;

                        return (
                            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="block font-bold text-slate-700">
                                            Số câu hỏi trong đề: <strong>{quizQuestionCount} câu</strong>
                                        </label>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {availableInScope > 0 && availableInScope < 30 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setQuizQuestionCount(availableInScope)}
                                                    className={`px-2 py-1 rounded-lg font-bold text-[10px] transition-colors cursor-pointer ${
                                                        quizQuestionCount === availableInScope
                                                            ? "bg-purple-600 text-white"
                                                            : "bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100"
                                                    }`}
                                                >
                                                    Tối đa ({availableInScope} câu)
                                                </button>
                                            )}
                                            {[10, 20, 30, 40].map((cnt) => (
                                                <button
                                                    key={cnt}
                                                    type="button"
                                                    onClick={() => setQuizQuestionCount(cnt)}
                                                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer ${
                                                        quizQuestionCount === cnt
                                                            ? "bg-purple-600 text-white"
                                                            : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                                                    }`}
                                                >
                                                    {cnt} câu
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="block font-bold text-slate-700">
                                            Thời gian làm bài: <strong>{quizDuration} phút</strong>
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            {[10, 15, 20, 30].map((dur) => (
                                                <button
                                                    key={dur}
                                                    type="button"
                                                    onClick={() => setQuizDuration(dur)}
                                                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer ${
                                                        quizDuration === dur
                                                            ? "bg-purple-600 text-white"
                                                            : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                                                    }`}
                                                >
                                                    {dur} phút
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {availableInScope > 0 && quizQuestionCount > availableInScope && (
                                    <div className="p-2 rounded-xl bg-amber-50/80 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[16px] text-amber-600">info</span>
                                        <span>
                                            Phạm vi hiện tại có <strong>{availableInScope} thẻ</strong>. Đề thi sẽ lấy tối đa <strong>{availableInScope} câu hỏi</strong> từ phạm vi này.
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Chọn bộ thẻ nguồn */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="font-bold text-slate-700">
                                Chọn bộ thẻ nguồn để bốc câu hỏi <span className="text-rose-500">*</span>:
                            </label>
                            <div className="flex items-center gap-2 text-[11px]">
                                <button
                                    type="button"
                                    onClick={() => setSelectedQuizDecks(myDecks.map((d) => d.id))}
                                    className="text-purple-600 font-semibold hover:underline"
                                >
                                    Chọn tất cả
                                </button>
                                <span>·</span>
                                <button
                                    type="button"
                                    onClick={() => setSelectedQuizDecks([])}
                                    className="text-slate-500 font-semibold hover:underline"
                                >
                                    Bỏ chọn
                                </button>
                            </div>
                        </div>

                        <input
                            type="text"
                            value={quizDeckSearch}
                            onChange={(e) => setQuizDeckSearch(e.target.value)}
                            placeholder="🔍 Tìm kiếm bộ thẻ..."
                            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-hidden focus:border-purple-500 text-xs"
                        />

                        <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white">
                            {myDecks
                                .filter((d) =>
                                    (d.title || "").toLowerCase().includes(quizDeckSearch.toLowerCase())
                                )
                                .map((deck) => {
                                    const isChecked = selectedQuizDecks.includes(deck.id);
                                    return (
                                        <label
                                            key={deck.id}
                                            className={`p-2.5 px-3 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                                                isChecked ? "bg-purple-50/50" : "hover:bg-slate-50"
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedQuizDecks((prev) => [...prev, deck.id]);
                                                        } else {
                                                            setSelectedQuizDecks((prev) =>
                                                                prev.filter((id) => id !== deck.id)
                                                            );
                                                        }
                                                    }}
                                                    className="w-4 h-4 text-purple-600 rounded-md"
                                                />
                                                <div>
                                                    <span className="font-semibold text-slate-800 block">
                                                        {deck.title}
                                                    </span>
                                                    {deck.description && (
                                                        <span className="text-[10px] text-slate-400 block truncate max-w-xs">
                                                            {deck.description}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                                                {deck.cards?.length || 0} thẻ
                                            </span>
                                        </label>
                                    );
                                })}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={() => setCreateQuizModalOpen(false)}
                            className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-xs"
                        >
                            Hủy bỏ
                        </button>
                        <button
                            type="submit"
                            disabled={savingQuiz}
                            className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition-colors disabled:opacity-50"
                        >
                            {savingQuiz ? "Đang tạo đề..." : "Tạo bài kiểm tra ngay"}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* MODAL 5: XEM DANH SÁCH HỌC SINH NỘP BÀI THI (GIÁO VIÊN) */}
            <Modal
                isOpen={quizSubmissionsModalOpen}
                onClose={() => setQuizSubmissionsModalOpen(false)}
                title={`Danh sách nộp bài: ${viewingQuiz?.title || "Bài kiểm tra"}`}
            >
                <div className="space-y-4 text-xs">
                    <div className="flex items-center justify-between bg-purple-50/60 p-3 rounded-xl border border-purple-100">
                        <span className="text-purple-900 font-medium">
                            Tổng số học viên đã nộp: <strong>{quizSubmissions.length} bạn</strong>
                        </span>
                        <span className="text-[11px] text-purple-700 font-bold">
                            Đề thi {viewingQuiz?.questionCount} câu ({viewingQuiz?.durationMinutes} phút)
                        </span>
                    </div>

                    {loadingQuizSubmissions ? (
                        <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                            <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                            <span>Đang nạp kết quả bài làm...</span>
                        </div>
                    ) : quizSubmissions.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 text-xs space-y-1">
                            <span className="material-symbols-outlined text-[28px] text-slate-300">hourglass_empty</span>
                            <p>Chưa có học viên nào nộp bài kiểm tra này.</p>
                        </div>
                    ) : (
                        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                            {quizSubmissions.map((s) => (
                                <div key={s.userId} className="p-3 px-4 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                                            {s.fullName.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <span className="font-bold text-slate-900 block">{s.fullName}</span>
                                            <span className="text-slate-400 text-[11px]">{s.email}</span>
                                        </div>
                                    </div>

                                    <div className="text-right space-y-0.5">
                                        <div className="font-bold text-sm text-purple-700">
                                            {s.score} / 100 điểm
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                            Đúng {s.correctCount}/{s.totalQuestions} câu · {Math.floor(s.timeSpentSeconds / 60)}p{s.timeSpentSeconds % 60}s
                                        </div>
                                        <div className="text-[9px] text-slate-400">
                                            {new Date(s.completedAt).toLocaleString("vi-VN")}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex justify-end pt-2">
                        <button
                            type="button"
                            onClick={() => setQuizSubmissionsModalOpen(false)}
                            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
                        >
                            Đóng lại
                        </button>
                    </div>
                </div>
            </Modal>

            {/* MODAL 6: CHỈNH SỬA LỚP HỌC TOÀN DIỆN (GIÁO VIÊN) */}
            <EditClassroomModal
                isOpen={editClassModalOpen}
                onClose={() => setEditClassModalOpen(false)}
                classroom={classroom}
                onUpdated={(updated) => {
                    setClassroom(updated);
                    setActionMsg("Đã cập nhật thông tin và lộ trình lớp học thành công!");
                    setTimeout(() => setActionMsg(null), 3000);
                }}
            />
        </div>
    );
};
