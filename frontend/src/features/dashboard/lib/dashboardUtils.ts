import type { FolderNode } from "@/types/api.types";
import type { FolderItem, LearningSettings } from "../types/dashboard.types";

/**
 * Số từ mục tiêu TÍCH LUỸ để đạt từng cấp JLPT (ước lượng phổ biến: N5 ~800, N4 ~1.500, N3 ~3.750, N2 ~6.000,
 * N1 ~10.000 từ). Bảng cũ đặt N2 (1.200) thấp hơn N3 (1.500) nên lên N2 thì mục tiêu lại giảm; số phải tăng dần theo cấp
 * (selfcheck kiểm). Người dùng vẫn tự đặt được số khác trong "Mục tiêu học tập".
 */
export const JLPT_TARGET_WORDS: Readonly<Record<"N5" | "N4" | "N3" | "N2" | "N1", number>> = {
  N5: 800,
  N4: 1500,
  N3: 3750,
  N2: 6000,
  N1: 10000,
};

/** Trình độ lạ / chưa đặt -> mục tiêu N5 (trình độ mặc định của tài khoản). hasOwn để "toString"... không lọt qua. */
export const getTargetWordsByLevel = (level: string): number =>
  Object.hasOwn(JLPT_TARGET_WORDS, level)
    ? JLPT_TARGET_WORDS[level as keyof typeof JLPT_TARGET_WORDS]
    : JLPT_TARGET_WORDS.N5;

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

const ACCESS_STYLE: Record<
  FolderItem["accessType"],
  Pick<FolderItem, "iconName" | "iconColor" | "tagLabel" | "tagBg" | "tagColor" | "tagIcon">
> = {
  private: {
    iconName: "folder",
    iconColor: "text-primary",
    tagLabel: "Riêng tư",
    tagBg: "bg-surface-container",
    tagColor: "text-on-surface-variant",
    tagIcon: "lock",
  },
  shared: {
    iconName: "folder_shared",
    iconColor: "text-secondary",
    tagLabel: "Chia sẻ nhóm",
    tagBg: "bg-secondary-fixed/40",
    tagColor: "text-on-secondary-fixed",
    tagIcon: "groups",
  },
  public: {
    iconName: "public",
    iconColor: "text-tertiary",
    tagLabel: "Công khai",
    tagBg: "bg-surface-container",
    tagColor: "text-on-surface-variant",
    tagIcon: "cloud_download",
  },
};

/**
 * Thư mục thật từ GET /folders -> dữ liệu hiển thị của dashboard.
 * Giữ nguyên id thật (UUID) để nút "Thêm bộ thẻ" gọi API được.
 */
export const toFolderItem = (node: FolderNode): FolderItem => {
  const accessType: FolderItem["accessType"] =
    node.accessType === "shared" || node.accessType === "public" ? node.accessType : "private";
  return {
    id: node.id,
    title: node.title,
    description: node.description || "Thư mục tài liệu trên NihonGen AI.",
    accessType,
    level: node.level || "Khác",
    ...ACCESS_STYLE[accessType],
  };
};

const DEFAULT_SETTINGS: LearningSettings = { dailyGoalWords: 20, targetWords: null, audioOnly: false };
const settingsKey = (email: string) => `nihongen_settings_${email}`;
/** Khóa cũ lưu cả chỉ số tự nhập; chỉ còn lấy lại 2 mục tiêu rồi xóa. */
const legacyKey = (email: string) => `nihongen_metrics_${email}`;

const positiveInt = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;

// localStorage là dữ liệu không tin cậy (sửa tay, bản cũ): kiểm từng trường, sai thì dùng mặc định.
const parseSettings = (raw: string | null): LearningSettings | null => {
  if (!raw) return null;
  try {
    const obj: unknown = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    const rec = obj as Record<string, unknown>;
    return {
      dailyGoalWords: positiveInt(rec.dailyGoalWords) ?? DEFAULT_SETTINGS.dailyGoalWords,
      targetWords: positiveInt(rec.targetWords),
      // Bản lưu cũ không có khoá này -> tắt (chỉ bật khi người dùng cố ý bật).
      audioOnly: rec.audioOnly === true,
    };
  } catch {
    return null;
  }
};

export const loadLearningSettings = (email: string | null): LearningSettings => {
  if (!email) return DEFAULT_SETTINGS;
  try {
    const current = parseSettings(localStorage.getItem(settingsKey(email)));
    if (current) return current;
    const parsedLegacy = parseSettings(localStorage.getItem(legacyKey(email)));
    if (parsedLegacy) {
      // Bản cũ luôn ghi totalTargetWords = mặc định theo trình độ -> coi như "tự động".
      const legacy: LearningSettings = { ...parsedLegacy, targetWords: null };
      localStorage.setItem(settingsKey(email), JSON.stringify(legacy));
      localStorage.removeItem(legacyKey(email));
      return legacy;
    }
  } catch {
    // Storage bị chặn (chế độ riêng tư): dùng mặc định.
  }
  return DEFAULT_SETTINGS;
};

export const saveLearningSettings = (email: string | null, settings: LearningSettings): void => {
  if (!email) return;
  try {
    localStorage.setItem(settingsKey(email), JSON.stringify(settings));
  } catch {
    // Không lưu được thì chỉ áp dụng trong phiên hiện tại.
  }
};
