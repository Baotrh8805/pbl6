// Đồ thị tri thức Neo4j + GraphRAG (/api/graph/*, /api/admin/graph/*; spec 2026-10-27 §8). Neo4j tắt → 503 GRAPH_UNAVAILABLE
// (errorCodeOf) để trang hiện hướng dẫn thay vì lỗi đỏ.
import { apiClient } from "./apiClient.ts";
import type {
    AdminGraphStatus,
    GraphAnswer,
    GraphConflict,
    GraphExplore,
    GraphPath,
    GraphRecommend,
    GraphSyncMe,
} from "../types/graph.types.ts";

export const GRAPH_UNAVAILABLE = "GRAPH_UNAVAILABLE";

export const exploreGraph = async (q: string, limit = 24, signal?: AbortSignal): Promise<GraphExplore> =>
    (await apiClient.get<GraphExplore>("/graph/explore", { params: { q, limit }, signal })).data;

export const fetchGraphPath = async (from: string, to: string): Promise<GraphPath> =>
    (await apiClient.get<GraphPath>("/graph/path", { params: { from, to } })).data;

export const fetchGraphRecommend = async (): Promise<GraphRecommend> =>
    (await apiClient.get<GraphRecommend>("/graph/recommend")).data;

export const fetchGraphConflicts = async (): Promise<{ items: GraphConflict[] }> =>
    (await apiClient.get<{ items: GraphConflict[] }>("/graph/conflicts")).data;

export const askGraph = async (question: string): Promise<GraphAnswer> =>
    (await apiClient.post<GraphAnswer>("/graph/ask", { question })).data;

/** Đồng bộ ngay dữ liệu học của mình (1 lần / phút); trang đồ thị gọi khi mở, lỗi bỏ qua. */
export const syncGraphMe = async (): Promise<GraphSyncMe> => (await apiClient.post<GraphSyncMe>("/graph/sync/me")).data;

// ---------- admin ----------

export const fetchAdminGraphStatus = async (): Promise<AdminGraphStatus> =>
    (await apiClient.get<AdminGraphStatus>("/admin/graph/status")).data;

export const buildAdminGraph = async (withGrammar = true): Promise<{ building: boolean; started: boolean }> =>
    (await apiClient.post<{ building: boolean; started: boolean }>("/admin/graph/build", null, { params: { withGrammar } })).data;

export const syncAdminGraph = async (): Promise<{ started: boolean; syncing: boolean }> =>
    (await apiClient.post<{ started: boolean; syncing: boolean }>("/admin/graph/sync")).data;
