import React from "react";
import { Modal } from "@/components/ui/Modal";

const kbd = "px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface font-label-sm whitespace-nowrap";

const ROWS: { keys: string[]; action: string }[] = [
    { keys: ["Space", "Enter"], action: "Lật thẻ / lật về mặt trước" },
    { keys: ["1", "2", "3", "4"], action: "Chấm Lại / Khó / Tốt / Dễ (chỉ khi đã lật thẻ)" },
    { keys: ["Z", "Ctrl+Z"], action: "Hoàn tác lượt chấm vừa rồi" },
    { keys: ["S"], action: "Bật / tắt xáo trộn thứ tự thẻ" },
    { keys: ["R"], action: "Nghe phát âm từ vựng / nghe lại" },
    { keys: ["?", "/"], action: "Mở / đóng bảng này" },
];

/** Bảng phím tắt trang học (spec 25/10 §3.2). Trên điện thoại: chạm thẻ để lật, vuốt trái = Lại, phải = Tốt. */
export const ShortcutHelpModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
    <Modal isOpen={isOpen} onClose={onClose} icon="keyboard" title="Phím tắt khi học" size="md">
        <table className="w-full text-body-md">
            <tbody>
                {ROWS.map((r) => (
                    <tr key={r.action} className="border-b border-surface-container-high last:border-0">
                        <td className="py-2 pr-3 align-top">
                            <span className="flex flex-wrap gap-1">
                                {r.keys.map((k) => (
                                    <kbd key={k} className={kbd}>
                                        {k}
                                    </kbd>
                                ))}
                            </span>
                        </td>
                        <td className="py-2 text-on-surface-variant">{r.action}</td>
                    </tr>
                ))}
            </tbody>
        </table>
        <p className="mt-3 text-label-md text-on-surface-variant">
            Chạm / bấm vào thẻ để lật qua lại. Trên điện thoại, khi đã lật: vuốt trái = Lại, vuốt phải = Tốt.
        </p>
    </Modal>
);
