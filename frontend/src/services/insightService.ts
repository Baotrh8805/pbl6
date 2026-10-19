// Insights người học (/api/insights, USER): điểm yếu, thẻ phản xạ chậm, "học gì tiếp". Response đi qua parse* (lib/insightUtils)
// vì backend bỏ trường null (NON_NULL) và vì đây là ranh giới dữ liệu không đáng tin.
import { apiClient } from "./apiClient.ts";
import { dayKey } from "../lib/learningStats.ts";
import { WEAKNESS_DAYS, parseFriction, parseNextSteps, parseWeaknesses } from "../lib/insightUtils.ts";
import type { FrictionResponse, NextStep, WeaknessResponse } from "../types/api.types.ts";

/** GET /insights/weaknesses?days= (1..365, mặc định 30): thẻ yếu + lý do + nhóm + có tạo được lộ trình bổ khuyết không. */
export const fetchWeaknesses = async (days: number = WEAKNESS_DAYS): Promise<WeaknessResponse> =>
    parseWeaknesses((await apiClient.get("/insights/weaknesses", { params: { days } })).data);

/** GET /insights/friction: thẻ phản xạ chậm 30 ngày (≤ 50, chậm nhất trước) + trung vị cá nhân. */
export const fetchFriction = async (): Promise<FrictionResponse> =>
    parseFriction((await apiClient.get("/insights/friction")).data);

/** GET /insights/next?date=: gửi ngày máy khách để "hôm nay" của lộ trình khớp múi giờ người dùng (như /learning-paths). */
export const fetchNextSteps = async (date: string = dayKey(new Date())): Promise<NextStep[]> =>
    parseNextSteps((await apiClient.get("/insights/next", { params: { date } })).data);
