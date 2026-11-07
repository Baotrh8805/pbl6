import React, { useEffect, useId, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/services/apiClient";
import { errorCodeOf } from "@/lib/apiErrorInfo";
import { acceptShareLink } from "@/services/deckShareService";

const PASSWORD_CODES = new Set(["SHARE_PASSWORD_REQUIRED", "SHARE_PASSWORD_WRONG"]);

// /d/:token (D9): người đã đăng nhập mở link chia sẻ → nhận quyền xem → chuyển tới trang bộ thẻ. Chưa đăng nhập thì ProtectedRoute
// đưa tới trang đăng nhập rồi quay lại đúng link này. Link có mật khẩu (27/10): server trả 403 SHARE_PASSWORD_REQUIRED → hỏi mật khẩu.
export const SharedDeckLinkPage: React.FC = () => {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const pwId = useId();

  useEffect(() => {
    let alive = true;
    acceptShareLink(token)
      .then((r) => alive && navigate(`/decks/${encodeURIComponent(r.deckId)}`, { replace: true }))
      .catch((e) => {
        if (!alive) return;
        if (errorCodeOf(e) === "SHARE_PASSWORD_REQUIRED") setNeedPassword(true);
        else setError(extractErrorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [token, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !password.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await acceptShareLink(token, password.trim());
      navigate(`/decks/${encodeURIComponent(r.deckId)}`, { replace: true });
    } catch (err) {
      const code = errorCodeOf(err);
      setError(code && PASSWORD_CODES.has(code) ? "Mật khẩu liên kết không đúng." : extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="max-w-lg mx-auto py-16 text-center flex flex-col items-center gap-3">
      <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-primary">
        {error && !needPassword ? "link_off" : needPassword ? "lock" : "link"}
      </span>
      {needPassword ? (
        <form onSubmit={submit} className="w-full max-w-sm flex flex-col items-stretch gap-3 text-left">
          <h1 className="font-headline-sm text-headline-sm font-bold text-center">Liên kết có mật khẩu</h1>
          <p className="text-body-sm text-on-surface-variant text-center">Người chia sẻ đã đặt mật khẩu cho liên kết này. Nhập mật khẩu để mở bộ thẻ.</p>
          <label htmlFor={pwId} className="text-xs font-semibold uppercase tracking-wider text-outline">
            Mật khẩu liên kết
          </label>
          <input
            id={pwId}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            autoFocus
            className="w-full px-3 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-body-md focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {error && <p role="alert" className="text-body-sm text-error">{error}</p>}
          <Button type="submit" isLoading={busy} disabled={busy || !password.trim()}>
            Mở bộ thẻ
          </Button>
          <Link to="/decks" className="text-primary text-label-md hover:underline text-center">Về bộ thẻ của tôi</Link>
        </form>
      ) : error ? (
        <>
          <h1 className="font-headline-sm text-headline-sm font-bold">Không mở được liên kết</h1>
          <p role="alert" className="text-body-sm text-on-surface-variant">{error}</p>
          <Link to="/decks" className="text-primary font-semibold hover:underline">Về bộ thẻ của tôi</Link>
        </>
      ) : (
        <p role="status" className="text-body-sm text-on-surface-variant">Đang mở bộ thẻ được chia sẻ…</p>
      )}
    </section>
  );
};

export default SharedDeckLinkPage;
