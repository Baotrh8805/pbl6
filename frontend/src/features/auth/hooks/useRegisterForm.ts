import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/authService";
import { extractErrorMessage } from "@/services/apiClient";
import { passwordPolicyError } from "@/lib/passwordRules";

export const useRegisterForm = () => {
  const navigate = useNavigate();
  // Hẹn giờ chuyển sang /login: hủy nếu người dùng rời trang trước đó.
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    []
  );

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Đợt 2 (A1): máy chủ bật xác thực email -> ở lại trang, hiện hướng dẫn kiểm tra hộp thư + nút gửi lại.
  const [pendingVerification, setPendingVerification] = useState<{ email: string; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const validate = (): boolean => {
    const newErrors: {
      fullName?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
    } = {};

    // Khớp RegisterRequest ở backend
    if (!fullName.trim()) {
      newErrors.fullName = "Họ tên không được để trống";
    } else if (fullName.trim().length > 100) {
      newErrors.fullName = "Họ tên tối đa 100 ký tự";
    }

    if (!email.trim()) {
      newErrors.email = "Email không được để trống";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Email không đúng định dạng";
    }

    // Cùng chính sách với PasswordPolicy của backend (27/10): 8–72 ký tự, có chữ, số, ký tự đặc biệt
    const policy = passwordPolicyError(password);
    if (policy) newErrors.password = policy;

    if (!confirmPassword) {
      newErrors.confirmPassword = "Vui lòng xác nhận mật khẩu";
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = "Mật khẩu xác nhận không khớp";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    setSuccessMessage(null);

    if (!validate()) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await authService.register({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
      });

      if (result.needsVerification) {
        // Chưa đăng nhập được cho tới khi bấm link trong email: không tự chuyển sang /login.
        setPendingVerification({ email: email.trim(), message: result.message });
        setPassword("");
        setConfirmPassword("");
        return;
      }
      setSuccessMessage(result.message);
      // Automatically navigate to login page after 2 seconds
      redirectTimer.current = setTimeout(() => {
        navigate("/login", { state: { registeredEmail: email.trim() } });
      }, 1800);
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      setApiError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    fullName,
    setFullName,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    errors,
    apiError,
    successMessage,
    pendingVerification,
    /** "Đăng ký bằng email khác": quay lại form (giữ họ tên, xoá mật khẩu đã nhập). */
    resetVerification: () => setPendingVerification(null),
    isLoading,
    handleSubmit,
  };
};
