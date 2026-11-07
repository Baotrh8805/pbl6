// Trạng thái URL của trang Từ điển cần nhớ khi rời trang (xem lib/searchMemory.ts): tab và tham số riêng của từng tab
// (Từ vựng q / e, Câu s, Dịch t / dir, Hán tự k / sub / r, Hán-Việt reading / level). Giữ khớp với TAB_PARAMS ở DictionaryPage.
export const DICTIONARY_MEMORY_KEY = "dictionary:lastSearch";
export const DICTIONARY_PARAMS = ["tab", "q", "e", "s", "t", "dir", "k", "sub", "r", "reading", "level"] as const;
