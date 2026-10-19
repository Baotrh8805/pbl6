// Hằng giao diện dùng chung của trang làm quiz (QuizPage + màn bắt đầu / xem lại tách ra component riêng).
import type { QuizMode } from "@/types/api.types";

export const SECONDS_PER_QUESTION = 30; // QuizService.SECONDS_PER_QUESTION (server giữ hạn giờ thật)

export const modeLabel = (m: QuizMode) => (m === "practice" ? "Làm từng câu" : "Làm hết bài thi");

export const quizShell = "min-h-screen bg-surface text-on-surface px-gutter py-space-lg";
export const quizPrimaryBtn =
    "px-4 py-2.5 min-h-11 rounded-lg bg-primary text-on-primary font-label-md font-semibold disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
export const quizSecondaryBtn =
    "px-4 py-2.5 min-h-11 rounded-lg bg-surface-container-high font-label-md font-semibold disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";
