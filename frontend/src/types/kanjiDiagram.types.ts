// Sơ đồ chữ Hán (/graph, spec docs/Plan/specs/2026-10-30-so-do-chu-han-design.md §3.4): payload của GET /api/nlp/kanji-diagram.
// ai-service dựng nodes / edges / detail từ KanjiVG + Unihan + JLPT + JMdict; backend chỉ ghép meaningVi từ dict_meanings.

export type KanjiDiagramMode = "structure" | "compounds";

/** center = chữ tâm; component = thành phần cấu tạo (role radical / phon / part); phonetic = chữ cùng họ chỉ âm;
 *  word = từ ghép (chế độ Từ ghép); kanji = chữ khác trong từ ghép. */
export type KanjiDiagramNodeType = "center" | "component" | "phonetic" | "word" | "kanji";
export type KanjiDiagramRole = "radical" | "phon" | "part";
/** phon = chỉ âm (trùng âm On); family = cùng phần chỉ âm nhưng khác âm; radical = bộ; part = thành phần khác;
 *  compound = tâm → từ ghép; contains = từ ghép → chữ khác trong từ. */
export type KanjiDiagramEdgeType = "radical" | "phon" | "part" | "family" | "compound" | "contains";

export interface KanjiDiagramNode {
    id: string;
    type: KanjiDiagramNodeType;
    label: string;
    hanViet?: string | null;
    meaningEn?: string | null;
    meaningVi?: string | null;
    jlpt?: string | null;
    strokeCount?: number | null;
    /** Có dữ liệu cấu tạo để mở tiếp (nút +). */
    expandable?: boolean;
    // component
    role?: KanjiDiagramRole;
    position?: string | null;
    /** Chữ gốc của biến thể (扌 → 手). */
    original?: string | null;
    /** Part là biến thể của chỉ âm này (土 trong 寺 → 之). */
    phon?: string | null;
    isRadical?: boolean;
    /** Bộ lấy từ Unihan vì KanjiVG không đánh dấu, không phải part thật. */
    virtual?: boolean;
    // phonetic
    sameOn?: boolean;
    // word
    reading?: string | null;
    key?: string | null;
}

export interface KanjiDiagramEdge {
    from: string;
    to: string;
    type: KanjiDiagramEdgeType;
}

export interface KanjiDiagramCandidate {
    kanji: string;
    hanViet: string | null;
    jlpt: string | null;
    meaningEn: string | null;
    meaningVi?: string | null;
}

export interface KanjiDiagramFormulaPart {
    part: string;
    original: string | null;
    position: string | null;
    role: KanjiDiagramRole;
    hanViet: string | null;
    meaningVi?: string | null;
}

export interface KanjiDiagramWord {
    term: string;
    reading: string | null;
    meaningEn: string | null;
    jlpt: string | null;
    hanViet: string | null;
    key: string | null;
    meaningVi?: string | null;
}

export interface KanjiDiagramPhonOf {
    kanji: string;
    hanViet: string | null;
    jlpt: string | null;
    sameOn: boolean;
    meaningVi?: string | null;
}

export interface KanjiDiagramRadical {
    no: number;
    char: string;
    nameVi: string | null;
    meaningVi: string | null;
    hanViet: string | null;
}

export interface KanjiDiagramDetail {
    kanji: string;
    hanViet: string | null;
    meaningEn: string | null;
    meaningVi?: string | null;
    on: string[];
    kun: string[];
    strokeCount: number | null;
    jlpt: string | null;
    radical: KanjiDiagramRadical | null;
    formula: KanjiDiagramFormulaPart[];
    phon: string | null;
    phonOf: KanjiDiagramPhonOf[];
    compounds: KanjiDiagramWord[];
}

export interface KanjiDiagramStats {
    kanji: number;
    words: number;
    /** kanji_parts.csv có mặt ở ai-service. */
    parts: boolean;
    /** jmdict.sqlite có mặt (chế độ Từ ghép đầy đủ). */
    jmdict: boolean;
}

export interface KanjiDiagramResponse {
    query: string;
    mode: KanjiDiagramMode;
    /** "k:<chữ>" hoặc null khi phải chọn chữ / không tìm thấy. */
    center: string | null;
    candidates: KanjiDiagramCandidate[];
    nodes: KanjiDiagramNode[];
    edges: KanjiDiagramEdge[];
    detail: KanjiDiagramDetail | null;
    stats: KanjiDiagramStats;
}
