import React from "react";
import { Link } from "react-router-dom";
import { firstHanVietReading, hanVietMapUrl } from "@/lib/hanVietUtils";

interface HanVietBadgeProps {
  hanViet: string;
  className?: string;
}

// Âm Hán-Việt của một từ (badge như trước) + link "Xem mạng lưới" sang bản đồ Hán–Việt (F1) theo âm đầu của từ:
// "NHẬT BẢN" -> /han-viet?reading=NHẬT. Chuỗi không có âm nào (rỗng sau chuẩn hoá) thì chỉ hiện badge.
export const HanVietBadge: React.FC<HanVietBadgeProps> = ({ hanViet, className = "" }) => {
  const url = hanVietMapUrl(hanViet);
  return (
    <span className={`inline-flex items-center gap-1.5 text-label-sm ${className}`}>
      <span className="font-semibold text-tertiary tracking-wide" title="Âm Hán-Việt">
        {hanViet}
      </span>
      {url && (
        <Link
          to={url}
          className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline whitespace-nowrap"
          title={`Xem các chữ Hán và từ ghép mang âm ${firstHanVietReading(hanViet)}`}
          aria-label={`Xem mạng lưới Hán-Việt của âm ${firstHanVietReading(hanViet)}`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
            hub
          </span>
          Xem mạng lưới
        </Link>
      )}
    </span>
  );
};
