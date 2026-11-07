import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Ruby } from "@/lib/ja";
import { useAsync } from "@/lib/useAsync";
import { splitContent } from "@/lib/cardContent";
import { formatRatio, formatSeconds } from "@/lib/insightUtils";
import { fetchFriction } from "@/services/insightService";

// F4 "ma sát trí nhớ": thẻ mà bạn nhớ ra chậm hơn hẳn thường lệ (đo bằng thời gian phản xạ khi học), để biết thẻ nào
// "nhớ được nhưng chưa thuộc". Chỉ đọc; thẻ này cũng nằm trong điểm yếu (lý do "Phản xạ chậm") ở trang Lộ trình.
export const FrictionTab: React.FC = () => {
    const [reload, setReload] = useState(0);
    const { data, error, loading } = useAsync(fetchFriction, [reload]);

    return (
        <div className="flex flex-col gap-space-md">
            <div className="rounded-xl bg-surface-container-lowest border border-surface-container-high p-space-md flex flex-col gap-2">
                <h2 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">timer</span>
                    Thẻ phản xạ chậm
                </h2>
                <p className="text-body-sm text-on-surface-variant">
                    Mỗi lần học, hệ thống đo thời gian từ lúc thẻ hiện ra tới lúc bạn chấm điểm. Một thẻ bị coi là{" "}
                    <strong className="text-on-surface">chậm</strong> khi trung vị của ít nhất 5 lần đo trong 30 ngày qua vượt 4
                    giây hoặc gấp đôi mức thường của bạn. Thời gian này chỉ dùng để gợi ý ôn tập, không làm đổi lịch ôn.
                </p>
                <p className="text-body-sm text-on-surface flex flex-wrap items-baseline gap-x-2">
                    <span className="text-on-surface-variant">Mức thường của bạn (trung vị):</span>
                    <strong className="font-headline-sm text-headline-sm tabular-nums">
                        {loading ? "…" : formatSeconds(data?.personalMedianMs ?? null)}
                    </strong>
                    {!loading && data && data.personalMedianMs === null && (
                        <span className="text-label-sm text-outline">Chưa đủ lần đo — hãy học thêm vài phiên.</span>
                    )}
                </p>
            </div>

            {loading ? (
                <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
                    <span className="sr-only">Đang tải thẻ phản xạ chậm...</span>
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-12 rounded-xl bg-surface-container-low animate-pulse" />
                    ))}
                </div>
            ) : error || !data ? (
                <p role="alert" className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-body-sm">
                    Không tải được dữ liệu: {error ?? "dữ liệu trống"}{" "}
                    <button type="button" onClick={() => setReload((n) => n + 1)} className="underline font-semibold">
                        Thử lại
                    </button>
                </p>
            ) : data.cards.length === 0 ? (
                <div className="flex items-center gap-3 p-space-md rounded-xl bg-surface-container-lowest border border-dashed border-surface-container-high text-body-sm text-on-surface-variant">
                    <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-secondary">bolt</span>
                    <span>Không có thẻ nào phản xạ chậm. Bạn nhớ ra các thẻ đã học khá nhanh!</span>
                </div>
            ) : (
                // Bảng cuộn ngang trong khung riêng ở màn hẹp (375 px) thay vì làm cả trang cuộn ngang.
                <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest overflow-x-auto">
                    <table className="w-full text-body-sm">
                        <caption className="sr-only">
                            {data.cards.length} thẻ phản xạ chậm, chậm nhất trước
                        </caption>
                        <thead className="bg-surface-container-low text-label-sm text-on-surface-variant">
                            <tr>
                                <th scope="col" className="text-left font-semibold px-3 py-2">Thẻ</th>
                                <th scope="col" className="text-right font-semibold px-3 py-2 whitespace-nowrap">Trung vị</th>
                                <th scope="col" className="text-right font-semibold px-3 py-2 whitespace-nowrap">Lần đo</th>
                                <th scope="col" className="text-right font-semibold px-3 py-2 whitespace-nowrap" title="So với mức thường của bạn">
                                    Gấp
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container-high">
                            {data.cards.map((c) => (
                                <tr key={c.cardId} className="align-top">
                                    <td className="px-3 py-2 min-w-[9rem]">
                                        <Link
                                            to={`/decks/${encodeURIComponent(c.deckId)}`}
                                            className="font-semibold text-on-surface hover:text-primary font-japanese break-all"
                                            title="Mở bộ thẻ chứa thẻ này"
                                        >
                                            <Ruby term={c.term} reading={c.reading ?? undefined} />
                                        </Link>
                                        <div className="text-label-sm text-on-surface-variant break-words">{splitContent(c.meaning).head}</div>
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold text-on-surface">
                                        {formatSeconds(c.medianReactionMs)}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">{c.samples}</td>
                                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-tertiary font-semibold">
                                        {formatRatio(c.ratio)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
