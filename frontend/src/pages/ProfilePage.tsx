import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import { useShell } from "@/components/layout/shellContext";
import { ProfileHero } from "@/features/profile/components/ProfileHero";
import { ProfileInfoTab } from "@/features/profile/components/ProfileInfoTab";
import { ProfileSecurityTab } from "@/features/profile/components/ProfileSecurityTab";
import { QuizHistoryTab } from "@/features/profile/components/QuizHistoryTab";
import { panelId, parseProfileTab, tabId, type ProfileTab } from "@/features/profile/lib/profileUtils";

export const ProfilePage: React.FC = () => {
    const { userProfile, userEmail } = useAuth();
    const { displayName, currentLevel, metrics, statsLoading } = useShell();

    // Tab nằm trên URL (?tab=security): F5 và link chia sẻ mở đúng tab.
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = parseProfileTab(searchParams.get("tab"));
    const changeTab = (tab: ProfileTab) =>
        setSearchParams(tab === "info" ? {} : { tab }, { replace: true });

    return (
        <section className="flex flex-col gap-space-lg pb-space-xl max-w-5xl">
            <ProfileHero
                displayName={displayName}
                email={userProfile?.email ?? userEmail ?? ""}
                currentLevel={currentLevel}
                metrics={metrics}
                statsLoading={statsLoading}
                activeTab={activeTab}
                onTabChange={changeTab}
            />

            <div role="tabpanel" id={panelId(activeTab)} aria-labelledby={tabId(activeTab)}>
                {activeTab === "info" && <ProfileInfoTab />}
                {activeTab === "security" && <ProfileSecurityTab />}
                {activeTab === "history" && <QuizHistoryTab />}
            </div>
        </section>
    );
};

export default ProfilePage;
