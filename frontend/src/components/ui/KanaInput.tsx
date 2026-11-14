import React, { useId, useLayoutEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { flushPending, hasKana, romajiToKanaFull, toKana, type KanaMode } from "@/lib/romaji";

export type { KanaMode };

/**
 * Ô nhập gõ romaji ra kana ngay khi gõ (E6), không cần bật IME của hệ điều hành.
 *
 * Cách dùng:
 *   const [reading, setReading] = useState("");
 *   <KanaInput label="Cách đọc" value={reading} onChange={setReading} onEnter={submit} />
 *
 * - `value` là chuỗi đang hiển thị: kana đã chuyển + đuôi romaji còn chờ (vd. "こn"). Enter / rời ô
 *   sẽ chốt đuôi (n -> ん) và gọi onChange với giá trị cuối; onEnter nhận giá trị đã chốt.
 * - Bỏ qua chuyển đổi khi IME của hệ điều hành đang ghép chữ (isComposing) và khi dán văn bản đã
 *   có kana (người dùng dán từ nơi khác thì không cần đổi gì).
 * - Nút あ/ア đổi bảng chữ cho phần gõ TIẾP THEO; chữ đã chuyển giữ nguyên.
 */
export interface KanaInputProps {
    value: string;
    /** `pending` = đuôi romaji chưa đủ âm tiết nằm cuối `value` ("" khi không có). */
    onChange: (value: string, pending: string) => void;
    /** Bảng chữ (có kiểm soát). Không truyền thì tự quản lý, bắt đầu từ `defaultMode`. */
    mode?: KanaMode;
    defaultMode?: KanaMode;
    onModeChange?: (mode: KanaMode) => void;
    /** Enter (không trong lúc IME ghép chữ): nhận giá trị đã chốt đuôi. Có truyền thì chặn submit form mặc định. */
    onEnter?: (value: string) => void;
    label?: string;
    "aria-label"?: string;
    placeholder?: string;
    helperText?: string;
    error?: string;
    id?: string;
    name?: string;
    disabled?: boolean;
    required?: boolean;
    autoFocus?: boolean;
    className?: string;
}

const MODE_NEXT: Record<KanaMode, KanaMode> = { hiragana: "katakana", katakana: "hiragana" };
const MODE_GLYPH: Record<KanaMode, string> = { hiragana: "あ", katakana: "ア" };
const MODE_NAME: Record<KanaMode, string> = { hiragana: "hiragana", katakana: "katakana" };

export const KanaInput: React.FC<KanaInputProps> = ({
    value,
    onChange,
    mode: modeProp,
    defaultMode = "hiragana",
    onModeChange,
    onEnter,
    label,
    "aria-label": ariaLabel,
    placeholder = "Gõ romaji, vd. nihongo",
    helperText,
    error,
    id,
    name,
    disabled,
    required,
    autoFocus,
    className = "",
}) => {
    const autoId = useId();
    const inputId = id ?? name ?? autoId;
    const inputRef = useRef<HTMLInputElement>(null);
    // Vị trí con trỏ cần đặt lại sau khi React ghi value mới (độ dài chuỗi đổi khi romaji thành kana).
    const caretRef = useRef<number | null>(null);
    // Đặt ở onPaste, đọc ở onChange ngay sau đó: lượt thay đổi này là dán văn bản có kana -> giữ nguyên.
    const skipNextRef = useRef(false);
    const [innerMode, setInnerMode] = useState<KanaMode>(defaultMode);
    const mode = modeProp ?? innerMode;
    const [pending, setPending] = useState("");
    // Cha có thể đặt lại value (vd. xoá ô sau khi nộp) -> đuôi chờ cũ không còn trong value thì bỏ.
    const shownPending = pending !== "" && value.endsWith(pending) ? pending : "";

    useLayoutEffect(() => {
        const el = inputRef.current;
        const caret = caretRef.current;
        caretRef.current = null;
        if (el && caret !== null && document.activeElement === el) el.setSelectionRange(caret, caret);
    }, [value]);

    const setMode = (next: KanaMode) => {
        if (modeProp === undefined) setInnerMode(next);
        onModeChange?.(next);
        inputRef.current?.focus();
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const el = e.target;
        const raw = el.value;
        const composing = (e.nativeEvent as InputEvent).isComposing === true;
        if (composing || skipNextRef.current) {
            skipNextRef.current = false;
            setPending("");
            onChange(raw, "");
            return;
        }
        // Chỉ chuyển phần TRƯỚC con trỏ: phần sau đã hiển thị từ trước, không được ảnh hưởng tới
        // cách đọc đuôi đang gõ (vd. "n" + kana phía sau).
        const caret = el.selectionStart ?? raw.length;
        const head = toKana(raw.slice(0, caret), mode);
        const converted = head.text + head.pending;
        caretRef.current = converted.length;
        setPending(head.pending);
        onChange(converted + raw.slice(caret), head.pending);
    };

    /** Chốt đuôi chờ (n -> ん) và mọi romaji còn sót; trả về giá trị cuối. */
    const flush = (): string => {
        const next = shownPending ? value.slice(0, value.length - shownPending.length) + flushPending(shownPending, mode) : value;
        const final = romajiToKanaFull(next, mode);
        setPending("");
        if (final !== value) onChange(final, "");
        return final;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
        const final = flush();
        if (onEnter) {
            e.preventDefault();
            onEnter(final);
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const text = e.clipboardData.getData("text");
        if (hasKana(text)) skipNextRef.current = true;
    };

    const nextMode = MODE_NEXT[mode];

    return (
        <Input
            ref={inputRef}
            id={inputId}
            name={name}
            label={label}
            aria-label={ariaLabel}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={() => {
                if (shownPending || /[a-z]/i.test(value)) flush();
            }}
            placeholder={placeholder}
            helperText={helperText}
            error={error}
            disabled={disabled}
            required={required}
            autoFocus={autoFocus}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            lang="ja"
            // Input chỉ chừa pr-10 (40px) cho rightAction, vừa nút あ/ア; khi có thêm chip romaji chờ thì
            // nhóm rộng ~60-70px nên nới padding để chữ gõ tới mép phải không chui xuống dưới chip
            // (pr-24 đứng sau pr-10 trong CSS Tailwind nên ghi đè được).
            className={`font-japanese ${shownPending ? "pr-24" : ""} ${className}`}
            rightAction={
                <div className="flex items-center gap-1">
                    {shownPending && (
                        // Đuôi romaji đang chờ cũng đã nằm trong ô nên chip chỉ là gợi ý thị giác.
                        <span
                            aria-hidden="true"
                            className="px-1.5 py-0.5 rounded-md bg-primary-fixed text-on-primary-fixed font-mono text-label-sm leading-none"
                            title="Romaji đang chờ đủ âm tiết"
                        >
                            {shownPending}…
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => setMode(nextMode)}
                        disabled={disabled}
                        aria-label={`Đang gõ ${MODE_NAME[mode]}, bấm để chuyển sang ${MODE_NAME[nextMode]}`}
                        title={`Chuyển sang ${MODE_NAME[nextMode]}`}
                        className="w-7 h-7 rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface font-japanese text-sm leading-none hover:border-primary hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                        <span lang="ja">{MODE_GLYPH[mode]}</span>
                    </button>
                </div>
            }
        />
    );
};
