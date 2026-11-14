import { apiClient } from "./apiClient.ts";
import type {
    Classroom,
    ClassroomLesson,
    ClassroomMember,
    CreateClassroomInput,
    JoinClassroomResult,
    Announcement,
    AnnouncementComment,
    LessonSubmission,
    UpdateClassroomInput,
    AddLessonInput,
} from "../types/classroom.types.ts";

export const createClassroom = async (input: CreateClassroomInput): Promise<Classroom> => {
    const res = await apiClient.post<Classroom>("/classrooms", input);
    return res.data;
};

export const fetchMyTeachingClassrooms = async (): Promise<Classroom[]> => {
    const res = await apiClient.get<Classroom[]>("/classrooms/my-teaching");
    return res.data;
};

export const fetchMyEnrolledClassrooms = async (): Promise<Classroom[]> => {
    const res = await apiClient.get<Classroom[]>("/classrooms/my-enrolled");
    return res.data;
};

export const fetchClassroomDetail = async (id: number): Promise<Classroom> => {
    const res = await apiClient.get<Classroom>(`/classrooms/${id}`);
    return res.data;
};

export const joinClassroomByCode = async (code: string): Promise<JoinClassroomResult> => {
    const res = await apiClient.post<JoinClassroomResult>("/classrooms/join", { code });
    return res.data;
};

export const fetchPendingMembers = async (classroomId: number): Promise<ClassroomMember[]> => {
    const res = await apiClient.get<ClassroomMember[]>(`/classrooms/${classroomId}/pending-members`);
    return res.data;
};

export const fetchApprovedMembers = async (classroomId: number): Promise<ClassroomMember[]> => {
    const res = await apiClient.get<ClassroomMember[]>(`/classrooms/${classroomId}/members`);
    return res.data;
};

export const approveMember = async (classroomId: number, targetUserId: number): Promise<void> => {
    await apiClient.post(`/classrooms/${classroomId}/members/${targetUserId}/approve`);
};

export const rejectMember = async (classroomId: number, targetUserId: number): Promise<void> => {
    await apiClient.post(`/classrooms/${classroomId}/members/${targetUserId}/reject`);
};

export const removeMember = async (classroomId: number, targetUserId: number): Promise<void> => {
    await apiClient.delete(`/classrooms/${classroomId}/members/${targetUserId}`);
};

export const completeClassroomLesson = async (classroomId: number, lessonId: number): Promise<void> => {
    await apiClient.post(`/classrooms/${classroomId}/lessons/${lessonId}/complete`);
};

export const updateClassroom = async (classroomId: number, input: UpdateClassroomInput): Promise<Classroom> => {
    const res = await apiClient.put<Classroom>(`/classrooms/${classroomId}`, input);
    return res.data;
};

export const addClassroomLesson = async (classroomId: number, input: AddLessonInput): Promise<ClassroomLesson> => {
    const res = await apiClient.post<ClassroomLesson>(`/classrooms/${classroomId}/lessons`, input);
    return res.data;
};

export const deleteClassroomLesson = async (classroomId: number, lessonId: number): Promise<void> => {
    await apiClient.delete(`/classrooms/${classroomId}/lessons/${lessonId}`);
};

export const fetchLessonSubmissions = async (classroomId: number, lessonId: number): Promise<LessonSubmission[]> => {
    const res = await apiClient.get<LessonSubmission[]>(`/classrooms/${classroomId}/lessons/${lessonId}/submissions`);
    return res.data;
};

export const fetchAnnouncements = async (classroomId: number): Promise<Announcement[]> => {
    const res = await apiClient.get<Announcement[]>(`/classrooms/${classroomId}/announcements`);
    return res.data;
};

export const createAnnouncement = async (
    classroomId: number,
    input: { title?: string; content: string; isPinned?: boolean }
): Promise<Announcement> => {
    const res = await apiClient.post<Announcement>(`/classrooms/${classroomId}/announcements`, input);
    return res.data;
};

export const deleteAnnouncement = async (classroomId: number, announcementId: number): Promise<void> => {
    await apiClient.delete(`/classrooms/${classroomId}/announcements/${announcementId}`);
};

export const addAnnouncementComment = async (
    classroomId: number,
    announcementId: number,
    content: string
): Promise<AnnouncementComment> => {
    const res = await apiClient.post<AnnouncementComment>(
        `/classrooms/${classroomId}/announcements/${announcementId}/comments`,
        { content }
    );
    return res.data;
};

export const deleteAnnouncementComment = async (
    classroomId: number,
    announcementId: number,
    commentId: number
): Promise<void> => {
    await apiClient.delete(`/classrooms/${classroomId}/announcements/${announcementId}/comments/${commentId}`);
};

import type {
    ClassroomQuiz,
    CreateClassroomQuizInput,
    QuizStartResponse,
    QuizSubmissionResult,
    QuizStudentSubmission,
    LeaderboardMember,
} from "../types/classroom.types";

/** Lấy danh sách bài kiểm tra của lớp học */
export const fetchClassroomQuizzes = async (classroomId: number): Promise<ClassroomQuiz[]> => {
    const res = await apiClient.get<ClassroomQuiz[]>(`/classrooms/${classroomId}/quizzes`);
    return res.data;
};

/** Tạo bài kiểm tra riêng cho lớp học (Giáo viên) */
export const createClassroomQuiz = async (
    classroomId: number,
    input: CreateClassroomQuizInput
): Promise<ClassroomQuiz> => {
    const res = await apiClient.post<ClassroomQuiz>(`/classrooms/${classroomId}/quizzes`, input);
    return res.data;
};

/** Xóa bài kiểm tra (Giáo viên) */
export const deleteClassroomQuiz = async (classroomId: number, quizId: number): Promise<void> => {
    await apiClient.delete(`/classrooms/${classroomId}/quizzes/${quizId}`);
};

/** Bắt đầu làm bài kiểm tra (Phát đề ngẫu nhiên theo số câu và dải thẻ) */
export const startClassroomQuiz = async (
    classroomId: number,
    quizId: number
): Promise<QuizStartResponse> => {
    const res = await apiClient.post<QuizStartResponse>(`/classrooms/${classroomId}/quizzes/${quizId}/start`);
    return res.data;
};

/** Nộp bài kiểm tra & nhận kết quả chấm điểm */
export const submitClassroomQuiz = async (
    classroomId: number,
    quizId: number,
    input: { attemptId: string; timeSpentSeconds: number; answers: Record<number, string> }
): Promise<QuizSubmissionResult> => {
    const res = await apiClient.post<QuizSubmissionResult>(
        `/classrooms/${classroomId}/quizzes/${quizId}/submit`,
        input
    );
    return res.data;
};

/** Xem danh sách học sinh nộp bài thi (Giáo viên) */
export const fetchQuizSubmissions = async (
    classroomId: number,
    quizId: number
): Promise<QuizStudentSubmission[]> => {
    const res = await apiClient.get<QuizStudentSubmission[]>(
        `/classrooms/${classroomId}/quizzes/${quizId}/submissions`
    );
    return res.data;
};

/** Lấy bảng xếp hạng học viên của lớp học */
export const fetchClassroomLeaderboard = async (
    classroomId: number
): Promise<LeaderboardMember[]> => {
    const res = await apiClient.get<LeaderboardMember[]>(`/classrooms/${classroomId}/leaderboard`);
    return res.data;
};
