import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DictPopover } from "./DictQuickLookup";

/**
 * Nút "Tra từ điển" ở màn học (D25, spec §7.3): mở popover tra nhanh thuật ngữ của thẻ; "Mở trong từ điển" sang /dictionary.
 * Thành phần độc lập để StudyPage chỉ thêm một dòng (tránh đụng logic lật / chấm).
 */
export const StudyDictButton: React.FC<{ term: string; className?: string }> = ({ term, className }) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Tra ${term} trong từ điển`}
        title="Tra từ điển"
        className={className}
      >
        <span className="material-symbols-outlined text-[22px]" aria-hidden="true">menu_book</span>
      </button>
      {open && (
        <DictPopover
          term={term}
          onClose={() => setOpen(false)}
          onOpen={(key) => navigate(`/dictionary?e=${encodeURIComponent(key)}&q=${encodeURIComponent(term)}`)}
        />
      )}
    </>
  );
};
