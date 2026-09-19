import type { UserMetrics, LessonItem, FolderItem } from "../types/dashboard.types";

export const getTargetWordsByLevel = (level: string): number => {
  switch (level) {
    case "N1":
      return 3000;
    case "N2":
      return 1200;
    case "N3":
      return 1500;
    case "N4":
      return 1000;
    case "N5":
      return 600;
    default:
      return 1200;
  }
};

export const getLevelDescription = (level: string): string => {
  switch (level) {
    case "N1":
      return "Cao Cấp Chuyên Sâu";
    case "N2":
      return "Trung Thượng Cấp";
    case "N3":
      return "Trung Cấp";
    case "N4":
      return "Sơ Trung Cấp";
    case "N5":
      return "Nhập Môn";
    default:
      return "Tiếng Nhật Tổng Hợp";
  }
};

// ponytail: chưa có API bài học/thư mục -> khởi tạo rỗng, hiển thị empty state thật.
// Nâng cấp khi backend mở /api/lessons và /api/folders: fetch thay cho mảng rỗng.
export const INITIAL_LESSONS: LessonItem[] = [];

export const INITIAL_FOLDERS: FolderItem[] = [];

export const loadUserMetrics = (userEmail: string | null, level: string): UserMetrics => {
  if (userEmail) {
    const saved = localStorage.getItem(`nihongen_metrics_${userEmail}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore parse error
      }
    }
  }

  // Học viên mới: mọi chỉ số bắt đầu từ 0, chỉ mục tiêu từ vựng suy ra từ trình độ thật.
  return {
    wordsLearned: 0,
    totalTargetWords: getTargetWordsByLevel(level),
    consolidatedWords: 0,
    studyHoursThisWeek: 0,
    studyHoursDiff: 0,
    quizAccuracy: null,
    dokkaiAccuracy: null,
    bunpouAccuracy: null,
    currentStreak: 0,
    maxStreak: 0,
    srsDueCount: 0,
    dailyGoalWords: 20,
    creditsUsed: 0,
    totalCredits: 5000,
  };
};

export const saveUserMetrics = (userEmail: string | null, metrics: UserMetrics): void => {
  if (userEmail) {
    localStorage.setItem(`nihongen_metrics_${userEmail}`, JSON.stringify(metrics));
  }
};
