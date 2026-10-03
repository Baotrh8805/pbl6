import { useEffect, useRef, useState } from "react";
import { extractErrorMessage } from "@/services/apiClient";

type Primitive = string | number | boolean | null | undefined;

// ponytail: fetch một lần mỗi khi deps đổi, không cache/retry.
// Nâng cấp khi cần chia sẻ cache giữa các trang: thay bằng TanStack Query.
// deps chỉ nhận giá trị nguyên thủy để so bằng một khóa chuỗi (object tạo mới mỗi render sẽ fetch lặp vô hạn).
// reload: tăng số này để tải lại NGẦM (vẫn giữ dữ liệu cũ, loading không bật), dùng sau khi sửa dữ liệu ngay tại trang.
// Muốn hiện trạng thái "đang tải" khi tải lại thì đưa số đếm vào deps.
export function useAsync<T>(run: () => Promise<T>, deps: readonly Primitive[], reload = 0) {
    const key = JSON.stringify(deps);
    const runRef = useRef(run);
    useEffect(() => {
        runRef.current = run;
    });

    // Kết quả gắn với khóa đã tạo ra nó: khóa đổi = đang tải, không cần setState({loading}) trong effect.
    const [state, setState] = useState<{ key?: string; data?: T; error?: string }>({});

    useEffect(() => {
        let alive = true;
        runRef.current()
            .then((data) => alive && setState({ key, data }))
            .catch((e) => alive && setState({ key, error: extractErrorMessage(e) }));
        return () => {
            alive = false;
        };
    }, [key, reload]);

    const loading = state.key !== key;
    return {
        data: loading ? undefined : state.data,
        error: loading ? undefined : state.error,
        loading,
    };
}
