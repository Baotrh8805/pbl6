import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { VerifyEmailPage } from "@/pages/VerifyEmailPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { DecksPage } from "@/pages/DecksPage";
import { DeckDetailPage } from "@/pages/DeckDetailPage";
import { DeckEditorPage } from "@/pages/DeckEditorPage";
import { StudyPage } from "@/pages/StudyPage";
import { QuizPage } from "@/pages/QuizPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { RoadmapPage } from "@/pages/RoadmapPage";
import { RoadmapDetailPage } from "@/pages/RoadmapDetailPage";
import { QuizRoomPage } from "@/pages/QuizRoomPage";
import { DeckLibraryPage } from "@/pages/DeckLibraryPage";
import { FoldersPage } from "@/pages/FoldersPage";
import { ExtractionPage } from "@/pages/ExtractionPage";
import { ExtractionsPage } from "@/pages/ExtractionsPage";
import { KnowledgeGraphPage } from "@/pages/KnowledgeGraphPage";
import { DictionaryPage } from "@/pages/DictionaryPage";
import { DataSourcesPage } from "@/pages/DataSourcesPage";
import { SharedDeckLinkPage } from "@/pages/SharedDeckLinkPage";
import { DeckPrintPage } from "@/pages/DeckPrintPage";
import { AdminDictionaryPage } from "@/pages/admin/AdminDictionaryPage";
import { AdminModerationPage } from "@/pages/admin/AdminModerationPage";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { AdminUsersPage } from "@/pages/admin/AdminUsersPage";
import { AdminUserDetailPage } from "@/pages/admin/AdminUserDetailPage";
import { AdminDecksPage } from "@/pages/admin/AdminDecksPage";
import { AdminDeckDetailPage } from "@/pages/admin/AdminDeckDetailPage";
import { AdminReportsPage } from "@/pages/admin/AdminReportsPage";
import { AdminAuditPage } from "@/pages/admin/AdminAuditPage";
import { AdminSettingsPage } from "@/pages/admin/AdminSettingsPage";
import { AdminMnemonicsPage } from "@/pages/admin/AdminMnemonicsPage";
import { AdminQuestionsPage } from "@/pages/admin/AdminQuestionsPage";
import { AdminKnowledgePage } from "@/pages/admin/AdminKnowledgePage";
import { AdminKnowledgeDetailPage } from "@/pages/admin/AdminKnowledgeDetailPage";
import { AdminAppealsPage } from "@/pages/admin/AdminAppealsPage";
import { AdminAccountPage } from "@/pages/admin/AdminAccountPage";
import { ProtectedRoute } from "./ProtectedRoute";
import { PublicRoute } from "./PublicRoute";
import { StaffSetupPage } from "@/pages/StaffSetupPage";

/** /kanji?tab=radicals&r=5&k=食 → /dictionary?tab=kanji&sub=radicals&r=5&k=食; /han-viet?reading=… → /dictionary?tab=hanviet&… */
const LegacyRedirect: React.FC<{ tab: "kanji" | "hanviet" }> = ({ tab }) => {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (tab === "kanji" && params.has("tab")) {
    params.set("sub", params.get("tab") ?? "");
    params.delete("tab");
  }
  params.set("tab", tab);
  return <Navigate to={`/dictionary?${params.toString()}`} replace />;
};

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPasswordPage />
          </PublicRoute>
        }
      />

      {/* Mở từ link trong email: không bọc PublicRoute để người đang đăng nhập vẫn đặt lại được */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* Link kích hoạt tài khoản trong email (?token=): cũng không bọc PublicRoute, người đang đăng nhập vẫn kích hoạt được */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      {/* Ghi nguồn dữ liệu / giấy phép (CC BY-SA): công khai */}
      <Route path="/about/data" element={<DataSourcesPage />} />

      {/* Protected Routes: layout lồng, Outlet giữ Header/Sidebar không remount */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/decks" element={<DecksPage />} />
        <Route path="/folders" element={<FoldersPage />} />
        <Route path="/library" element={<DeckLibraryPage />} />
        <Route path="/decks/new" element={<DeckEditorPage mode="create" />} />
        <Route path="/decks/:deckId" element={<DeckDetailPage />} />
        {/* Link riêng chia sẻ bộ thẻ (D9): nhận quyền xem rồi chuyển sang /decks/:id */}
        <Route path="/d/:token" element={<SharedDeckLinkPage />} />
        <Route path="/decks/:deckId/edit" element={<DeckEditorPage mode="edit" />} />
        <Route path="/decks/:deckId/add-cards" element={<DeckEditorPage mode="add-cards" />} />
        <Route path="/extractions" element={<ExtractionsPage />} />
        <Route path="/extractions/:id" element={<ExtractionPage />} />
        <Route path="/roadmap" element={<RoadmapPage />} />
        <Route path="/roadmap/:id" element={<RoadmapDetailPage />} />
        <Route path="/quiz" element={<QuizRoomPage />} />
        {/* Từ điển (spec 2026-10-26, D14): Từ vựng + Hán tự (/kanji cũ) + Hán-Việt (/han-viet cũ) + Sổ tay */}
        <Route path="/dictionary" element={<DictionaryPage />} />
        {/* Đồ thị tri thức Neo4j + GraphRAG (spec 2026-10-27): ?tab=explore&q= | suggest | ask | path */}
        <Route path="/graph" element={<KnowledgeGraphPage />} />
        {/* Route cũ chuyển sang tab tương ứng, giữ tham số (link trong thông báo, bộ thẻ, bookmark vẫn đúng) */}
        <Route path="/han-viet" element={<LegacyRedirect tab="hanviet" />} />
        <Route path="/kanji" element={<LegacyRedirect tab="kanji" />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* Staff mới: đổi mật khẩu seed; ProtectedRoute tự đưa về đây khi backend báo còn thiếu */}
      <Route
        path="/setup"
        element={
          <ProtectedRoute>
            <StaffSetupPage />
          </ProtectedRoute>
        }
      />

      {/* Admin Panel: staff (ADMIN / SUPER_ADMIN); người học bị đưa về "/" */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute minRole="ADMIN">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="users/:id" element={<AdminUserDetailPage />} />
        <Route path="decks" element={<AdminDecksPage />} />
        <Route path="decks/:id" element={<AdminDeckDetailPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="mnemonics" element={<AdminMnemonicsPage />} />
        {/* Chi tiết câu hỏi là modal mở bằng ?question=<id> (link chia sẻ được), không có route riêng */}
        <Route path="questions" element={<AdminQuestionsPage />} />
        <Route path="knowledge" element={<AdminKnowledgePage />} />
        <Route path="knowledge/:id" element={<AdminKnowledgeDetailPage />} />
        <Route path="appeals" element={<AdminAppealsPage />} />
        <Route path="audit" element={<AdminAuditPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        {/* Hồ sơ của staff: đổi mật khẩu sau lần bắt buộc ở /setup (staff không dùng /profile của người học) */}
        <Route path="dictionary" element={<AdminDictionaryPage />} />
        <Route path="moderation" element={<AdminModerationPage />} />
        <Route path="account" element={<AdminAccountPage />} />
      </Route>

      {/* Ngoài layout: học và kiểm tra chiếm trọn màn hình */}
      <Route
        path="/decks/:deckId/print"
        element={
          <ProtectedRoute>
            <DeckPrintPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/decks/:deckId/study"
        element={
          <ProtectedRoute>
            <StudyPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/decks/:deckId/quiz"
        element={
          <ProtectedRoute>
            <QuizPage />
          </ProtectedRoute>
        }
      />
      {/* Lộ trình 2.0: phiên học hợp nhất (thẻ của nhiều bộ) — cùng StudyPage, chế độ ?session=&path= */}
      <Route
        path="/session"
        element={
          <ProtectedRoute>
            <StudyPage />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
