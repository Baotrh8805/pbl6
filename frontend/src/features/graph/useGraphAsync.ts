import { useEffect, useRef, useState } from "react";
import { extractErrorMessage } from "@/services/apiClient";
import { errorCodeOf } from "@/lib/apiErrorInfo";
import { GRAPH_UNAVAILABLE } from "@/services/graphService";

type Primitive = string | number | boolean | null | undefined;

/**
 * Như lib/useAsync nhưng giữ thêm mã lỗi (503 GRAPH_UNAVAILABLE → trang hiện hướng dẫn bật Neo4j thay vì lỗi đỏ). Kết quả gắn với
 * khoá của deps tạo ra nó (khoá đổi = đang tải) nên không setState trong effect ngoài lúc promise về.
 */
export function useGraphAsync<T>(run: () => Promise<T>, deps: readonly Primitive[], reload: Primitive = 0) {
    const key = JSON.stringify(deps);
    const runRef = useRef(run);
    useEffect(() => {
        runRef.current = run;
    });
    const [state, setState] = useState<{ key?: string; data?: T; error?: string; code?: string | null }>({});
    useEffect(() => {
        let alive = true;
        runRef.current()
            .then((data) => alive && setState({ key, data }))
            .catch((e) => alive && setState({ key, error: extractErrorMessage(e), code: errorCodeOf(e) }));
        return () => {
            alive = false;
        };
    }, [key, reload]);
    const loading = state.key !== key;
    return {
        data: loading ? undefined : state.data,
        error: loading ? undefined : state.error,
        unavailable: !loading && state.code === GRAPH_UNAVAILABLE,
        loading,
    };
}
