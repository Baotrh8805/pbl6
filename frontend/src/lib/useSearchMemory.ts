import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { pickParams, readSearchMemory, restoreOnEnter, writeSearchMemory } from "./searchMemory";

/**
 * Nhớ tham số URL của trang trong tab (sessionStorage) và khôi phục MỘT LẦN khi vào trang với URL trống (mục sidebar không kèm
 * tham số). Trả true trong khung hình đang chờ khôi phục (trang nên trả null để không vẽ trạng thái trống rồi nhảy).
 *
 * Gắn với location.key của mục lịch sử lúc vào trang, không với setSearchParams: react-router đổi danh tính setSearchParams mỗi khi
 * URL đổi, nên effect phụ thuộc nó chạy lại sau mỗi lần đổi tab / bộ lọc và ghi đè URL về trạng thái đã nhớ (lỗi 30/10: Từ điển kẹt
 * ở ?tab=kanji&k=結, bấm "Từ vựng" / "Câu" bị đưa về). Sau khi replace, location.key đổi nên không bao giờ khôi phục lại; URL trống
 * về sau (tab Từ vựng không tham số, xoá ô tìm) là ý người dùng, không phải "đang chờ khôi phục".
 */
export function useSearchMemory(memoryKey: string, allowed: readonly string[]): boolean {
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const [enter] = useState(() => ({
        key: location.key,
        restore: restoreOnEnter(params, readSearchMemory(memoryKey), allowed),
    }));
    const restoring = enter.restore !== null && location.key === enter.key;

    useEffect(() => {
        if (restoring && enter.restore) setParams(enter.restore, { replace: true });
    }, [restoring, enter, setParams]);

    useEffect(() => {
        if (!restoring) writeSearchMemory(memoryKey, pickParams(params, allowed));
    }, [params, restoring, memoryKey, allowed]);

    return restoring;
}
