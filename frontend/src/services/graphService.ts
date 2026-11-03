// Đồ thị tri thức Neo4j — chỉ còn phần Admin (/api/admin/graph/*: trạng thái, dựng, đồng bộ; spec 2026-10-27 §8). Trang /graph
// của người học đã thành Sơ đồ chữ Hán (kanjiDiagramService, spec 2026-10-30) nên các hàm explore / path / recommend / ask /
// sync/me không còn ở frontend; backend và ai-service vẫn giữ API.
import { apiClient } from "./apiClient.ts";
import type { AdminGraphStatus } from "../types/graph.types.ts";

export const fetchAdminGraphStatus = async (): Promise<AdminGraphStatus> =>
    (await apiClient.get<AdminGraphStatus>("/admin/graph/status")).data;

export const buildAdminGraph = async (withGrammar = true): Promise<{ building: boolean; started: boolean }> =>
    (await apiClient.post<{ building: boolean; started: boolean }>("/admin/graph/build", null, { params: { withGrammar } })).data;

export const syncAdminGraph = async (): Promise<{ started: boolean; syncing: boolean }> =>
    (await apiClient.post<{ started: boolean; syncing: boolean }>("/admin/graph/sync")).data;
