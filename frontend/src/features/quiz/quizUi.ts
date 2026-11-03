// Hằng giao diện dùng chung của trang làm quiz (QuizPage + màn bắt đầu / xem lại tách ra component riêng).
import type { QuizMode } from "@/types/api.types";

export const SECONDS_PER_QUESTION = 30; // QuizService.SECONDS_PER_QUESTION (server giữ hạn giờ thật)

export const modeLabel = (m: QuizMode) => (m === "practice" ? "Làm từng câu" : "Làm hết bài thi");

export const quizShell = "min-h-screen bg-slate-50 text-slate-900 px-4 sm:px-6 py-6 md:py-8";
export const quizPrimaryBtn =
    "px-5 py-2.5 min-h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-xs transition-all active:scale-95 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer";
export const quizSecondaryBtn =
    "px-4 py-2.5 min-h-11 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-sm shadow-xs transition-colors disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer";
