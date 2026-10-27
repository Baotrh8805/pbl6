// Đồ thị tri thức Neo4j + GraphRAG (spec docs/Plan/specs/2026-10-27-do-thi-tri-thuc-neo4j-design.md §6–§8).
// Id node có tiền tố: w:<id JMdict> | k:<chữ> | rad:<số> | c:<chữ> | h:<ÂM> | g:<id> | s:<id> | d:<id> | card:<id> | p:<id> | ch:<id>.

export type GraphNodeType =
    | "word" | "kanji" | "radical" | "component" | "hanviet" | "grammar" | "sentence"
    | "deck" | "card" | "path" | "chapter" | "user";

/** Tình trạng học của chính người xem với một từ / chữ (chỉ có khi backend gửi userId). */
export interface GraphLearnerState {
    cards: number;
    reviewed: number;
    due: number;
    again30d: number;
}

export interface GraphNode {
    id: string;
    type: GraphNodeType;
    label: string;
    learner?: GraphLearnerState;
    // Word
    key?: string;
    term?: string;
    reading?: string;
    gloss?: string;
    vi?: string;
    jlpt?: string | null;
    common?: boolean;
    kanaOnly?: boolean;
    // Kanji / Component / Radical
    char?: string;
    hanViet?: string;
    strokes?: number;
    radicalNo?: number;
    meaning?: string;
    no?: number;
    nameVi?: string;
    meaningVi?: string;
    // Grammar
    name?: string;
    level?: string;
    // Sentence
    jpn?: string;
    eng?: string;
    // Deck / Card / Path / Chapter
    title?: string;
    deckId?: string;
    wordKey?: string;
    position?: number;
    status?: string;
}

export interface GraphEdge {
    from: string;
    to: string;
    /** contains | has_radical | has_component | read_as | homophone_of | looks_like | example_of | uses_grammar | means | has_card | schedules … */
    type: string;
    score?: number;
}

/** GET /api/graph/explore: center null = không tìm thấy (200, không phải lỗi). */
export interface GraphExplore {
    query: string;
    center: string | null;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface GraphPath {
    from: GraphNode | null;
    to: GraphNode | null;
    found: boolean;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface GraphRecommend {
    level: string;
    words: { word: GraphNode; sharedKanji: number; totalKanji: number; knownChars: string[] }[];
    weakKanji: { kanji: GraphNode; again30d: number; terms: string[]; radical: GraphNode | null; similar: string[] }[];
    homophones: { word: GraphNode; withTerms: string[]; count: number }[];
}

export interface GraphConflictSide {
    card: GraphNode;
    deck: GraphNode;
    word: GraphNode | null;
}

export interface GraphConflict {
    term: string;
    kind: "reading" | "meaning";
    a: GraphConflictSide;
    b: GraphConflictSide;
}

export interface GraphAskSource {
    n: number;
    id: string;
    type: string;
    label: string;
    text: string;
    branch: "graph" | "text" | "both";
}

export interface GraphAnswer {
    question: string;
    answer: string;
    /** "template" = ghép thẳng từ đồ thị (chưa có khoá Gemini / Gemini lỗi), còn lại là tên model Gemini. */
    model: string;
    note: string | null;
    entities: GraphNode[];
    sources: GraphAskSource[];
    subgraph: { nodes: GraphNode[]; edges: GraphEdge[] };
}

export interface GraphSyncMe {
    run: string;
    rows: Record<string, number>;
    millis: number;
}

export interface AdminGraphAiStatus {
    available: boolean;
    built: boolean;
    building?: boolean;
    step?: string | null;
    builtAt?: string | null;
    buildSeconds?: number | null;
    withGrammar?: boolean | null;
    counts?: Record<string, number>;
    learner?: { lastRun: string | null; syncedAt: string | null; scope: string | null } | null;
    error?: string | null;
}

export interface AdminGraphStatus {
    ai: AdminGraphAiStatus;
    syncing: boolean;
    lastSync: { at: string; rows: Record<string, number>; millis: number } | null;
    lastSyncError: string | null;
}
