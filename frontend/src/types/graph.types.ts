// Đồ thị tri thức Neo4j (spec docs/Plan/specs/2026-10-27-do-thi-tri-thuc-neo4j-design.md §8) — frontend chỉ còn dùng phần
// trạng thái Admin (AdminGraphCard). Kiểu node / cạnh / explore / ask của trang người học đã bỏ cùng trang /graph cũ
// (nay là Sơ đồ chữ Hán, xem kanjiDiagram.types.ts).

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
