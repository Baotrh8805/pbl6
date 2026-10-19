import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authService } from "../services/authService";
import { useAuth } from "@/context/useAuth";
import { extractErrorMessage } from "@/services/apiClient";
import { isStaff, setupPending } from "@/lib/roles";
import { loginErrorKind, type LoginErrorKind } from "../authUtils";

export const useLoginForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Mặc định giữ đăng nhập như trước; bỏ tick thì token chỉ sống trong tab (sessionStorage).
  const [rememberMe, setRememberMe] = useState(true);
  
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  // Lỗi cần nút riêng (gửi lại email xác thực / gửi khiếu nại) + email của lần đăng nhập đó: người dùng có sửa ô email
  // sau khi lỗi thì nút vẫn gửi cho đúng tài khoản máy chủ vừa báo.
  const [errorKind, setErrorKind] = useState<LoginErrorKind>(null);
  const [failedEmail, setFailedEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const validate = (): boolean => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      newErrors.email = "Email không được để trống";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Email không đúng định dạng";
    }

    if (!password) {
      newErrors.password = "Mật khẩu không được để trống";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    setErrorKind(null);

    if (!validate()) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await authService.login({ email: email.trim(), password });
      login(response.accessToken, response.refreshToken, email.trim(), rememberMe);
      // ProtectedRoute lưu trang đang mở vào state.from -> đăng nhập xong quay lại đúng trang đó.
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      // Staff không có trang học: vào thẳng Admin Panel (hoặc /setup nếu chưa đổi mật khẩu seed)
      navigate(setupPending(response) ? "/setup" : isStaff(response.role) ? "/admin" : from && from !== "/login" ? from : "/", {
        replace: true,
      });
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      setApiError(msg);
      setErrorKind(loginErrorKind(err));
      setFailedEmail(email.trim());
    } finally {
      setIsLoading(false);
    }
  };

  return {
    email,
    setEmail,
    password,
    setPassword,
    rememberMe,
    setRememberMe,
    errors,
    apiError,
    errorKind,
    failedEmail,
    isLoading,
    handleSubmit,
  };
};
