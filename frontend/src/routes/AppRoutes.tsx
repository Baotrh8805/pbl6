import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { DecksPage } from "@/pages/DecksPage";
import { DeckDetailPage } from "@/pages/DeckDetailPage";
import { DeckEditorPage } from "@/pages/DeckEditorPage";
import { StudyPage } from "@/pages/StudyPage";
import { QuizPage } from "@/pages/QuizPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { RoadmapPage } from "@/pages/RoadmapPage";
import { QuizRoomPage } from "@/pages/QuizRoomPage";
import { DeckLibraryPage } from "@/pages/DeckLibraryPage";
import { FoldersPage } from "@/pages/FoldersPage";
import { AppLayout } from "@/components/layout/AppLayout";
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
        <Route path="/decks/:deckId/add" element={<DeckEditorPage mode="add-cards" />} />
        <Route path="/roadmap" element={<RoadmapPage />} />
        <Route path="/quiz" element={<QuizRoomPage />} />
        <Route path="/profile" element={<ProfilePage />} />
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
