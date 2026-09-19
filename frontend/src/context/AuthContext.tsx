import React, { createContext, useContext, useState, useEffect } from "react";

import { authService } from "@/features/auth/services/authService";

export interface UserProfile {
  id?: number;
  email: string;
  fullName?: string;
  jlptLevel?: string;
  isPremium?: boolean;
}

interface AuthContextType {
  token: string | null;
  userEmail: string | null;
  userProfile: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, email?: string) => void;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  updateJlptLevel: (newLevel: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const profile = await authService.getProfile();
      setUserProfile(profile);
      if (profile.email) {
        setUserEmail(profile.email);
        localStorage.setItem("userEmail", profile.email);
      }
    } catch {
      // Offline fallback: chỉ dùng email thật đã lưu, không bịa trình độ JLPT
      const savedEmail = localStorage.getItem("userEmail");
      if (savedEmail) {
        setUserProfile((prev) => prev || { email: savedEmail });
      }
    }
  };

  useEffect(() => {
    const savedToken = localStorage.getItem("accessToken");
    const savedEmail = localStorage.getItem("userEmail");
    if (savedToken) {
      setToken(savedToken);
      setUserEmail(savedEmail);
      fetchProfile().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = (newToken: string, email?: string) => {
    setToken(newToken);
    localStorage.setItem("accessToken", newToken);
    if (email) {
      setUserEmail(email);
      localStorage.setItem("userEmail", email);
    }
    fetchProfile();
  };

  const logout = () => {
    setToken(null);
    setUserEmail(null);
    setUserProfile(null);
    localStorage.removeItem("accessToken");
    localStorage.removeItem("userEmail");
  };

  const refreshProfile = async () => {
    await fetchProfile();
  };

  const updateJlptLevel = async (newLevel: string) => {
    try {
      await authService.updateJlptLevel(newLevel);
    } catch {
      // silent fallback
    }
    setUserProfile((prev) => (prev ? { ...prev, jlptLevel: newLevel } : null));
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        userEmail,
        userProfile,
        isAuthenticated: !!token,
        isLoading,
        login,
        logout,
        refreshProfile,
        updateJlptLevel,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
