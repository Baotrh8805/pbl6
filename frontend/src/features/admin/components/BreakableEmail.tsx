import React from "react";

/**
 * Email trong ô bảng hẹp: chỉ cho xuống dòng ngay trước "@" (và sau dấu chấm của tên miền) thay vì cắt giữa chữ như
 * break-all ("superadmin@nihong" / "en.local"). Không có "@" -> in nguyên.
 */
export const BreakableEmail: React.FC<{ email: string }> = ({ email }) => {
  const at = email.indexOf("@");
  if (at <= 0) return <>{email}</>;
  const domain = email.slice(at + 1).split(".");
  return (
    <>
      {email.slice(0, at)}
      <wbr />@
      {domain.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <>
              <wbr />.
            </>
          )}
          {part}
        </React.Fragment>
      ))}
    </>
  );
};
