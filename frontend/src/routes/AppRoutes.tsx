import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
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
import { ProtectedRoute } from "./ProtectedRoute";
import { PublicRoute } from "./PublicRoute";

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
        <Route path="/decks/:deckId/edit" element={<DeckEditorPage mode="edit" />} />
        <Route path="/decks/:deckId/add-cards" element={<DeckEditorPage mode="add-cards" />} />
        <Route path="/extractions" element={<ExtractionsPage />} />
        <Route path="/extractions/:id" element={<ExtractionPage />} />
        <Route path="/roadmap" element={<RoadmapPage />} />
        <Route path="/roadmap/:id" element={<RoadmapDetailPage />} />
        <Route path="/quiz" element={<QuizRoomPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* Admin Panel: staff (VIEWER trở lên); người học bị đưa về "/" */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute minRole="VIEWER">
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
        <Route path="audit" element={<AdminAuditPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>

      {/* Ngoài layout: học và kiểm tra chiếm trọn màn hình */}
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

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
