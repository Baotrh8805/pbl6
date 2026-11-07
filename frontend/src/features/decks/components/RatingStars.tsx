import React from "react";

interface RatingStarsProps {
    value: number; // 0 = chưa chọn
    onChange?: (stars: number) => void; // thiếu = chỉ hiển thị
    disabled?: boolean;
    sizeClass?: string;
}

// 1-5 sao: có onChange thì bấm chọn được, không thì chỉ để xem.
export const RatingStars: React.FC<RatingStarsProps> = ({ value, onChange, disabled, sizeClass = "text-[22px]" }) => (
    <div role={onChange ? "group" : "img"} aria-label={onChange ? "Chọn số sao" : `${value} trên 5 sao`} className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => {
            const star = (
                <span
                    aria-hidden="true"
                    className={`material-symbols-outlined ${sizeClass}`}
                    style={{ fontVariationSettings: `'FILL' ${value >= n ? 1 : 0}` }}
                >
                    star
                </span>
            );
            return onChange ? (
                <button
                    key={n}
                    type="button"
                    disabled={disabled}
                    aria-label={`${n} sao`}
                    aria-pressed={value === n}
                    onClick={() => onChange(n)}
                    className="p-0.5 text-amber-500 hover:scale-110 transition-transform disabled:opacity-50 cursor-pointer"
                >
                    {star}
                </button>
            ) : (
                <span key={n} className="text-amber-500">
                    {star}
                </span>
            );
        })}
    </div>
);
