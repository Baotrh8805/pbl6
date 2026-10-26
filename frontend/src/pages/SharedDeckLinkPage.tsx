import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { extractErrorMessage } from "@/services/apiClient";
import { acceptShareLink } from "@/services/deckShareService";

// /d/:token (D9): người đã đăng nhập mở link chia sẻ → nhận quyền xem → chuyển tới trang bộ thẻ. Chưa đăng nhập thì ProtectedRoute
// đưa tới trang đăng nhập rồi quay lại đúng link này.
export const SharedDeckLinkPage: React.FC = () => {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    acceptShareLink(token)
      .then((r) => alive && navigate(`/decks/${encodeURIComponent(r.deckId)}`, { replace: true }))
      .catch((e) => alive && setError(extractErrorMessage(e)));
    return () => {
      alive = false;
    };
  }, [token, navigate]);

  return (
    <section className="max-w-lg mx-auto py-16 text-center flex flex-col items-center gap-3">
      <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-primary">{error ? "link_off" : "link"}</span>
      {error ? (
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
