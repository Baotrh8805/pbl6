export type ClassroomPrivacy = "PUBLIC" | "PRIVATE";
export type ClassroomMemberRole = "TEACHER" | "STUDENT";
export type ClassroomMemberStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ClassroomLesson {
    id: number;
    orderIndex: number;
    title: string;
    scheduledDate?: string | null;
    hasQuiz?: boolean;
    quizDurationMinutes?: number;
    deckIds?: string[];
    isCompleted?: boolean;
    quizScore?: number | null;
    completedMembersCount?: number;
}

export interface Classroom {
    id: number;
    name: string;
    description?: string;
    code: string;
    jlptLevel?: string;
    privacy: ClassroomPrivacy;
    ownerId: number;
    ownerName?: string;
    maxStudents: number;
    memberCount: number;
    pendingCount: number;
    isOwner: boolean;
    myStatus: ClassroomMemberStatus | "NONE";
    createdAt: string;
    lessons?: ClassroomLesson[];
}

export interface ClassroomMember {
    userId: number;
    fullName: string;
    email: string;
    role: ClassroomMemberRole;
    status: ClassroomMemberStatus;
    joinedAt: string;
    completedLessonsCount?: number;
}

export interface CreateLessonInput {
    orderIndex?: number;
    title: string;
    scheduledDate?: string | null;
    hasQuiz?: boolean;
    quizDurationMinutes?: number;
    deckIds?: string[];
}

export interface CreateClassroomInput {
    name: string;
    description?: string;
    jlptLevel?: string;
    privacy: ClassroomPrivacy;
    maxStudents?: number;
    lessons?: CreateLessonInput[];
}

export interface JoinClassroomResult {
    classroomId: number;
    status: ClassroomMemberStatus;
    message: string;
}

export interface LessonSubmission {
    userId: number;
    fullName: string;
    email: string;
    isCompleted: boolean;
    completedAt?: string | null;
    quizScore?: number | null;
}

export interface AnnouncementComment {
    id: number;
    announcementId: number;
    userId: number;
    userName: string;
    content: string;
    createdAt: string;
}

export interface Announcement {
    id: number;
    classroomId: number;
    authorId: number;
    authorName: string;
    title?: string;
    content: string;
    isPinned?: boolean;
    createdAt: string;
    comments?: AnnouncementComment[];
}

export interface UpdateLessonItemInput {
    id?: number;
    orderIndex?: number;
    title: string;
    scheduledDate?: string | null;
    deckIds?: string[];
}

export interface UpdateClassroomInput {
    name: string;
    description?: string;
    jlptLevel?: string;
    privacy: ClassroomPrivacy;
    maxStudents?: number;
    lessons?: UpdateLessonItemInput[];
}

export interface AddLessonInput {
    orderIndex?: number;
    title: string;
    scheduledDate?: string | null;
    hasQuiz?: boolean;
    quizDurationMinutes?: number;
    deckIds?: string[];
}

export interface ClassroomQuiz {
    id: number;
    classroomId: number;
    lessonId?: number | null;
    lessonTitle?: string | null;
    title: string;
    description?: string | null;
    durationMinutes: number;
    questionCount: number;
    cardRange?: string | null;
    deckIds: string[];
    isPublished?: boolean;
    createdAt: string;
    myLatestScore?: number | null;
    submissionCount: number;
    scopeType?: "LESSON_ONLY" | "CUMULATIVE_UP_TO_LESSON" | "CLASSROOM_ALL";
    requiredLessonId?: number | null;
    requiredLessonTitle?: string | null;
    isLockedForUser?: boolean;
    extraDeckIds?: string[];
}

export interface CreateClassroomQuizInput {
    lessonId?: number | null;
    title: string;
    description?: string;
    durationMinutes?: number;
    questionCount?: number;
    deckIds?: string[];
    cardRange?: string;
    scopeType?: "LESSON_ONLY" | "CUMULATIVE_UP_TO_LESSON" | "CLASSROOM_ALL";
    requiredLessonId?: number | null;
    extraDeckIds?: string[];
}

export interface QuizQuestionItem {
    index: number;
    cardId: string;
    term: string;
    reading?: string;
    options: string[];
}

export interface QuizStartResponse {
    attemptId: string;
    quizId: number;
    title: string;
    durationMinutes: number;
    expiresAt: string;
    questions: QuizQuestionItem[];
}

export interface GradedItem {
    index: number;
    term: string;
    reading?: string;
    options: string[];
    chosenAnswer?: string | null;
    correctAnswer: string;
    isCorrect: boolean;
    explanation?: string | null;
}

export interface QuizSubmissionResult {
    submissionId: number;
    quizId: number;
    score: number;
    correctCount: number;
    totalQuestions: number;
    timeSpentSeconds: number;
    completedAt: string;
    items: GradedItem[];
}

export interface QuizStudentSubmission {
    userId: number;
    fullName: string;
    email: string;
    score: number;
    correctCount: number;
    totalQuestions: number;
    timeSpentSeconds: number;
    completedAt: string;
}

export interface LeaderboardMember {
    userId: number;
    fullName: string;
    email: string;
    completedLessonsCount: number;
    averageQuizScore: number;
    quizzesTakenCount: number;
    rank: number;
}
