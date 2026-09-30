import React, { useState } from "react";
import { useAuth } from "@/context/useAuth";
import { useShell } from "@/components/layout/shellContext";
import { authService } from "@/features/auth/services/authService";
import { extractErrorMessage } from "@/services/apiClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getLevelDescription, getTargetWordsByLevel } from "@/features/dashboard/lib/dashboardUtils";
import { JLPT_LEVELS } from "@/lib/deckUtils";
import { DAILY_GOAL_PRESETS, isValidDailyGoal } from "../lib/profileUtils";
import { SectionCard, StatusMessage, type Status } from "./ProfileUi";

const NAME_MAX = 100;

const GOAL_HINT: Record<number, string> = { 10: "Thư thả", 20: "Vừa phải", 30: "Cân bằng", 50: "Cường độ cao" };

export const ProfileInfoTab: React.FC = () => {
    const { userProfile, userEmail, refreshProfile, updateJlptLevel } = useAuth();
    const { currentLevel, settings, saveSettings, openEditMetrics } = useShell();

    // Status nằm ở đây, không trong NameForm: lưu xong NameForm remount (key đổi) sẽ mất state.
    const [nameStatus, setNameStatus] = useState<Status>(null);

    const [pendingLevel, setPendingLevel] = useState<string | null>(null);
    const [levelStatus, setLevelStatus] = useState<Status>(null);

    const [customGoal, setCustomGoal] = useState("");
    const [savingGoal, setSavingGoal] = useState(false);
    const [goalStatus, setGoalStatus] = useState<Status>(null);

    const changeLevel = async (level: string) => {
        if (pendingLevel || level === currentLevel) return;
        setPendingLevel(level);
        setLevelStatus(null);
        try {
            await updateJlptLevel(level);
            setLevelStatus({ type: "success", text: `Đã đặt mục tiêu JLPT ${level}.` });
        } catch (err) {
            setLevelStatus({ type: "error", text: extractErrorMessage(err) });
        } finally {
            setPendingLevel(null);
        }
    };

    const applyGoal = async (goal: number) => {
        if (!isValidDailyGoal(goal)) {
            setGoalStatus({ type: "error", text: "Mục tiêu mỗi ngày phải là số nguyên từ 1 đến 500." });
            return;
        }
        if (goal === settings.dailyGoalWords) return;
        setSavingGoal(true);
        setGoalStatus(null);
        try {
            // Giữ nguyên targetWords; truyền currentLevel để không gọi API đổi trình độ.
            await saveSettings({ ...settings, dailyGoalWords: goal }, currentLevel);
            setCustomGoal("");
            setGoalStatus({ type: "success", text: `Mục tiêu mới: ${goal} thẻ mỗi ngày.` });
        } catch (err) {
            setGoalStatus({ type: "error", text: extractErrorMessage(err) });
        } finally {
            setSavingGoal(false);
        }
    };

    const isPreset = (DAILY_GOAL_PRESETS as readonly number[]).includes(settings.dailyGoalWords);

    return (
        <div className="grid gap-space-lg lg:grid-cols-2">
            <SectionCard title="Thông tin cá nhân" description="Tên hiển thị trên thanh điều hướng và bộ thẻ bạn chia sẻ.">
                <NameForm
                    key={userProfile?.fullName ?? ""}
                    email={userProfile?.email ?? userEmail ?? ""}
                    fullName={userProfile?.fullName ?? ""}
                    onStatus={setNameStatus}
                    onSaved={refreshProfile}
                />
                <StatusMessage status={nameStatus} />
            </SectionCard>

            <SectionCard title="Trình độ JLPT mục tiêu" description="Dùng để gợi ý lộ trình và bộ thẻ phù hợp.">
                <div
                    role="group"
                    aria-label="Chọn trình độ JLPT"
                    aria-busy={!!pendingLevel}
                    className="grid grid-cols-5 gap-2"
                >
                    {JLPT_LEVELS.map((lvl) => {
                        const active = lvl === currentLevel;
                        return (
                            <button
                                key={lvl}
                                type="button"
                                aria-pressed={active}
                                disabled={!!pendingLevel}
                                onClick={() => void changeLevel(lvl)}
                                className={`flex flex-col items-center gap-0.5 py-3 px-1 rounded-lg border transition-all cursor-pointer disabled:cursor-wait focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                                    active
                                        ? "bg-primary text-on-primary border-primary shadow-md"
                                        : "bg-surface-container-low text-on-surface-variant border-surface-container-high hover:bg-surface-container"
                                } ${pendingLevel === lvl ? "animate-pulse" : ""}`}
                            >
                                <span className="font-headline-sm text-headline-sm font-bold">{lvl}</span>
                                <span className="text-[11px] leading-tight text-center opacity-80 hidden sm:block">
                                    {getLevelDescription(lvl)}
                                </span>
                            </button>
                        );
                    })}
                </div>
                {settings.targetWords === null && (
                    <p className="text-body-sm text-on-surface-variant">
                        Tổng số từ mục tiêu tự đổi theo trình độ (hiện {getTargetWordsByLevel(currentLevel).toLocaleString("vi-VN")} từ).
                    </p>
                )}
                <StatusMessage status={levelStatus} />
            </SectionCard>

            <SectionCard title="Mục tiêu mỗi ngày" description="Số thẻ bạn muốn ôn mỗi ngày; lưu trên trình duyệt này.">
                <div role="group" aria-label="Chọn nhanh mục tiêu" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {DAILY_GOAL_PRESETS.map((g) => {
                        const active = g === settings.dailyGoalWords;
                        return (
                            <button
                                key={g}
                                type="button"
                                aria-pressed={active}
                                disabled={savingGoal}
                                onClick={() => void applyGoal(g)}
                                className={`flex flex-col items-center py-2.5 rounded-lg border transition-all cursor-pointer disabled:cursor-wait focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                    active
                                        ? "bg-secondary-container text-on-secondary-container border-secondary shadow-sm"
                                        : "bg-surface-container-low text-on-surface-variant border-surface-container-high hover:bg-surface-container"
                                }`}
                            >
                                <span className="font-label-md text-label-md font-bold">{g} thẻ</span>
                                <span className="text-[11px] opacity-80">{GOAL_HINT[g]}</span>
                            </button>
                        );
                    })}
                </div>

                <form
                    className="flex items-end gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void applyGoal(Number(customGoal));
                    }}
                    noValidate
                >
                    <Input
                        name="customGoal"
                        label="Tùy chỉnh (1–500)"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={500}
                        placeholder={isPreset ? "VD: 40" : String(settings.dailyGoalWords)}
                        value={customGoal}
                        onChange={(e) => setCustomGoal(e.target.value)}
                    />
                    <Button type="submit" variant="outline" isLoading={savingGoal} disabled={!customGoal}>
                        Áp dụng
                    </Button>
                </form>

                <p className="text-body-sm text-on-surface-variant">
                    Hiện tại: <strong className="text-on-surface">{settings.dailyGoalWords} thẻ/ngày</strong>
                    {!isPreset && " (tùy chỉnh)"}.{" "}
                    <button
                        type="button"
                        onClick={openEditMetrics}
                        className="text-primary font-semibold underline-offset-2 hover:underline cursor-pointer"
                    >
                        Thiết lập nâng cao
                    </button>
                </p>
                <StatusMessage status={goalStatus} />
            </SectionCard>
        </div>
    );
};

interface NameFormProps {
    email: string;
    fullName: string;
    onStatus: (s: Status) => void;
    onSaved: () => Promise<void>;
}

// Mount lại khi fullName từ server đổi (key) -> state khởi tạo từ props, không cần effect đồng bộ.
const NameForm: React.FC<NameFormProps> = ({ email, fullName, onStatus, onSaved }) => {
    const [name, setName] = useState(fullName);
    const [saving, setSaving] = useState(false);
    const trimmed = name.trim();
    const error =
        trimmed.length === 0 ? "Họ tên không được để trống." : trimmed.length > NAME_MAX ? `Tối đa ${NAME_MAX} ký tự.` : "";
    const unchanged = trimmed === fullName.trim();

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (error || unchanged) return;
        setSaving(true);
        onStatus(null);
        try {
            await authService.updateProfile(trimmed);
            onStatus({ type: "success", text: "Đã lưu thông tin." });
            await onSaved(); // Header/Sidebar lấy tên từ userProfile nên tự cập nhật
        } catch (err) {
            onStatus({ type: "error", text: extractErrorMessage(err) });
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-space-md" noValidate>
            <Input
                name="email"
                label="Email"
                type="email"
                value={email}
                readOnly
                helperText="Email đăng nhập không thể thay đổi."
                className="bg-surface-container-low text-on-surface-variant"
            />
            <Input
                name="fullName"
                label="Họ và tên"
                required
                maxLength={NAME_MAX}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={!unchanged ? error : ""}
            />
            <Button type="submit" className="self-start" isLoading={saving} disabled={!!error || unchanged}>
                Lưu thông tin
            </Button>
        </form>
    );
};
