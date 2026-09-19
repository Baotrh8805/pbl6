export interface UserMetrics {
  wordsLearned: number;
  totalTargetWords: number;
  consolidatedWords: number;
  studyHoursThisWeek: number;
  studyHoursDiff: number;
  quizAccuracy: number | null;
  dokkaiAccuracy: number | null;
  bunpouAccuracy: number | null;
  currentStreak: number;
  maxStreak: number;
  srsDueCount: number;
  dailyGoalWords: number;
  creditsUsed: number;
  totalCredits: number;
}

export interface LessonItem {
  id: number;
  title: string;
  tag: string;
  tagBg: string;
  tagColor: string;
  time: string;
  description: string;
  progressText: string;
  progressPct: number;
  status: "in_progress" | "completed";
  actionLabel: string;
  actionIcon: string;
  barGradient?: string;
  barColor?: string;
  btnVariant?: "primary" | "secondary";
}

export interface FolderItem {
  id: string;
  title: string;
  description: string;
  accessType: "private" | "shared" | "public";
  level: string;
  iconName: string;
  iconBg: string;
  iconColor: string;
  tagLabel: string;
  tagBg: string;
  tagColor: string;
  tagIcon?: string;
  metrics?: { value: string; label: string; highlight?: boolean }[];
  members?: { type: "avatar" | "text"; src?: string; text?: string; bg?: string }[];
  metricsRight?: { top: string; sub: string };
  link: string;
}

export interface QuickUploadOptions {
  orientation: "horizontal" | "vertical";
  autoFurigana: boolean;
  autoHanViet: boolean;
  generateQuiz: boolean;
  targetDeckId?: string;
}
