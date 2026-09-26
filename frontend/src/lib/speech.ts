// Đọc tiếng Nhật bằng Web Speech API có sẵn của trình duyệt (không cần thư viện TTS).
export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

export const speak = (text: string): void => {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    window.speechSynthesis.speak(utterance);
};
