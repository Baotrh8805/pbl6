import { useEffect, useSyncExternalStore } from "react";
import { dayKey } from "@/lib/learningStats";
import { DATA_CHANGED_EVENT, extractErrorMessage } from "@/services/apiClient";
import { fetchTodaySummary } from "@/services/learningPathService";
import type { TodaySummaryItem } from "@/types/api.types";

export interface TodaySummaryState {
  /** null = chưa tải lần nào. */
  data: TodaySummaryItem[] | null;
  error: string | null;
  loading: boolean;
}

/*
 * Cache dùng chung cho GET /learning-paths/today-summary (LP-16): badge sidebar, widget Tổng quan và thẻ danh sách cùng
 * đọc MỘT lần tải thay vì mỗi nơi tự gọi /learning-paths. Store nhỏ ở mức module + useSyncExternalStore:
 * - Tải khi có người dùng đầu tiên; các nơi mount sau nhận ngay snapshot.
 * - Sau mỗi request ghi thành công (apiClient phát DATA_CHANGED_EVENT) dữ liệu bị đánh dấu cũ; đang có người xem thì tải
 *   lại (gộp 300 ms như AppLayout), không thì tải ở lần mount kế (trang học nằm ngoài layout: chấm thẻ xong quay về là mới).
 * - Qua ngày mới (dayKey đổi) cũng tải lại vì "hôm nay" của server tính theo ?date=.
 */
let state: TodaySummaryState = { data: null, error: null, loading: false };
let loadedFor = "";
let stale = true;
let inflight: Promise<void> | null = null;
let reloadAfter = false;
let listening = false;
let timer: number | undefined;
const subscribers = new Set<() => void>();

const emit = (next: TodaySummaryState) => {
  state = next;
  for (const cb of subscribers) cb();
};

// Không export: không có nơi nào tải lại bằng tay — mọi lần làm mới đi qua DATA_CHANGED_EVENT / đổi ngày ở dưới.
function loadTodaySummary(force = false): Promise<void> {
  const date = dayKey(new Date());
  if (inflight) {
    if (force) reloadAfter = true;
    return inflight;
  }
  if (!force && !stale && state.data && loadedFor === date) return Promise.resolve();
  emit({ ...state, loading: true });
  inflight = fetchTodaySummary(date)
    .then((data) => {
      loadedFor = date;
      stale = false;
      emit({ data, error: null, loading: false });
    })
    .catch((e: unknown) => emit({ data: state.data, error: extractErrorMessage(e), loading: false }))
    .finally(() => {
      inflight = null;
      if (reloadAfter) {
        // Có thao tác ghi trong lúc đang tải: kết quả vừa về có thể đã cũ -> tải thêm một lần.
        reloadAfter = false;
        void loadTodaySummary(true);
      }
    });
  return inflight;
}

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener(DATA_CHANGED_EVENT, () => {
    stale = true;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (subscribers.size > 0) void loadTodaySummary(true);
    }, 300);
  });
}

const subscribe = (cb: () => void) => {
  listen();
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
};
const getSnapshot = () => state;

/** Tóm tắt "hôm nay" của mọi lộ trình ACTIVE; `data` rỗng = không có lộ trình đang học. */
export function useTodaySummary(): TodaySummaryState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    void loadTodaySummary();
  }, []);
  return snapshot;
}
