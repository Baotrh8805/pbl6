import type { LearningStats } from "@/lib/learningStats";

/** Người dùng tự đặt, lưu localStorage theo email. Mọi chỉ số còn lại tính từ API. */
export interface LearningSettings {
  dailyGoalWords: number;
  /** null = tự suy từ trình độ JLPT (getTargetWordsByLevel). */
  targetWords: number | null;
}

/** Chỉ số hiển thị trên dashboard = số liệu thật + mục tiêu người dùng đặt. */
export interface UserMetrics extends LearningStats {
  totalTargetWords: number;
  dailyGoalWords: number;
}

export interface FolderItem {
  id: string;
  title: string;
  description: string;
  accessType: "private" | "shared" | "public";
  level: string;
  iconName: string;
  iconColor: string;
  tagLabel: string;
  tagBg: string;
  tagColor: string;
  tagIcon: string;
}
