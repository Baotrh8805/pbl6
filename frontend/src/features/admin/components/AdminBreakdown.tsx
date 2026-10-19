import React from "react";
import type { AdminStats } from "@/types/api.types";
import { extractionBreakdown } from "../adminUtils.ts";

interface AdminBreakdownProps {
  stats: AdminStats;
}

const toPct = (val: number, total: number): number => {
  if (!total || total <= 0 || !val || val <= 0) return 0;
  return Math.min(100, Math.round((val / total) * 100));
};

export const AdminBreakdown: React.FC<AdminBreakdownProps> = ({ stats }) => {
  const { extractions, users, decks } = stats;

  // 1. Phân rã tác vụ AI (Done, Running, Failed, Khác)
  const extTotal = extractions.total || 0;
  const extDone = extractions.done || 0;
  const extRunning = extractions.running || 0;
  const extFailed = extractions.failed || 0;
  const {
    other: extOther,
    donePct,
    runningPct,
    failedPct,
    otherPct,
  } = extractionBreakdown(extTotal, extDone, extRunning, extFailed);

  // 2. Tỉ lệ người dùng
  const userTotal = users.total || 0;
  const userActive7dPct = toPct(users.active7d, userTotal);
  const userPremiumPct = toPct(users.premium, userTotal);
  const userLockedPct = toPct(users.locked, userTotal);

  // 3. Tỉ lệ bộ thẻ
  const deckTotal = decks.total || 0;
  const deckPublicPct = toPct(decks.public, deckTotal);
  const deckOfficialPct = toPct(decks.official, deckTotal);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Cột 1: Cơ cấu Tác vụ Bóc tách AI (Thanh ngang xếp chồng) */}
      <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-space-md flex flex-col justify-between shadow-xs">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-headline-sm text-title-md font-bold text-on-surface">
              Cơ cấu Bóc tách AI
            </h3>
            <span className="text-label-sm font-semibold text-outline">
              Tổng {extTotal.toLocaleString("vi-VN")}
            </span>
          </div>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Trạng thái các phiên xử lý tài liệu học.
          </p>

          {/* Thanh xếp chồng (Stacked bar) */}
          <div
            className="mt-4 h-3.5 w-full rounded-full bg-surface-container-low overflow-hidden flex"
            aria-label={`Tiến độ bóc tách: Hoàn thành ${donePct}%, Đang chạy ${runningPct}%, Thất bại ${failedPct}%`}
          >
            {extDone > 0 && (
              <div
                style={{ width: `${donePct}%` }}
                className="bg-secondary transition-all duration-500"
                title={`Hoàn thành: ${extDone} (${donePct}%)`}
              />
            )}
            {extRunning > 0 && (
              <div
                style={{ width: `${runningPct}%` }}
                className="bg-primary-container transition-all duration-500"
                title={`Đang chạy: ${extRunning} (${runningPct}%)`}
              />
            )}
            {extFailed > 0 && (
              <div
                style={{ width: `${failedPct}%` }}
                className="bg-error transition-all duration-500"
                title={`Thất bại: ${extFailed} (${failedPct}%)`}
              />
            )}
            {extOther > 0 && (
              <div
                style={{ width: `${otherPct}%` }}
                className="bg-surface-container-highest transition-all duration-500"
                title={`Khác/Chờ: ${extOther} (${otherPct}%)`}
              />
            )}
          </div>
        </div>

        {/* Chú giải phân bổ chi tiết */}
        <div className="mt-4 pt-3 border-t border-surface-container-high grid grid-cols-2 gap-2 text-label-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary shrink-0" />
            <span className="truncate text-on-surface-variant">Hoàn thành:</span>
            <span className="font-bold text-on-surface ml-auto">{extDone} ({donePct}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary-container shrink-0" />
            <span className="truncate text-on-surface-variant">Đang chạy:</span>
            <span className="font-bold text-on-surface ml-auto">{extRunning} ({runningPct}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-error shrink-0" />
            <span className="truncate text-on-surface-variant">Thất bại:</span>
            <span className="font-bold text-on-surface ml-auto">{extFailed} ({failedPct}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-surface-container-highest shrink-0" />
            <span className="truncate text-on-surface-variant">Khác:</span>
            <span className="font-bold text-on-surface ml-auto">{extOther} ({otherPct}%)</span>
          </div>
        </div>
      </div>

      {/* Cột 2: Tỉ lệ Người dùng (3 thanh độc lập) */}
      <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-space-md flex flex-col justify-between shadow-xs">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-headline-sm text-title-md font-bold text-on-surface">
              Chỉ số Người dùng
            </h3>
            <span className="text-label-sm font-semibold text-outline">
              Tổng {userTotal.toLocaleString("vi-VN")}
            </span>
          </div>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Mức độ tích cực và phân hạng tài khoản.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            {/* Thanh 1: Hoạt động 7 ngày */}
            <div>
              <div className="flex justify-between text-label-sm mb-1">
                <span className="text-on-surface-variant font-medium">Hoạt động 7 ngày</span>
                <span className="font-bold text-on-surface">
                  {users.active7d} / {userTotal} · {userActive7dPct}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-container-low overflow-hidden">
                <div
                  style={{ width: `${userActive7dPct}%` }}
                  className="h-full bg-secondary rounded-full transition-all duration-500"
                />
              </div>
            </div>

            {/* Thanh 2: Pro (Premium) */}
            <div>
              <div className="flex justify-between text-label-sm mb-1">
                <span className="text-on-surface-variant font-medium">Tài khoản Pro</span>
                <span className="font-bold text-on-surface">
                  {users.premium} / {userTotal} · {userPremiumPct}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-container-low overflow-hidden">
                <div
                  style={{ width: `${userPremiumPct}%` }}
                  className="h-full bg-primary-container rounded-full transition-all duration-500"
                />
              </div>
            </div>

            {/* Thanh 3: Đang bị khoá */}
            <div>
              <div className="flex justify-between text-label-sm mb-1">
                <span className="text-on-surface-variant font-medium">Bị khoá</span>
                <span className={`font-bold ${users.locked > 0 ? "text-error" : "text-outline"}`}>
                  {users.locked} / {userTotal} · {userLockedPct}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-container-low overflow-hidden">
                <div
                  style={{ width: `${userLockedPct}%` }}
                  className={`h-full rounded-full transition-all duration-500 ${
                    users.locked > 0 ? "bg-error" : "bg-outline"
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-surface-container-high text-label-sm text-outline">
          Đo lường trên lượng người học có phát sinh ôn tập trong tuần.
        </div>
      </div>

      {/* Cột 3: Tỉ lệ Bộ thẻ (2 thanh độc lập) */}
      <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-space-md flex flex-col justify-between shadow-xs">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-headline-sm text-title-md font-bold text-on-surface">
              Cơ cấu Bộ thẻ
            </h3>
            <span className="text-label-sm font-semibold text-outline">
              Tổng {deckTotal.toLocaleString("vi-VN")}
            </span>
          </div>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Tỉ lệ công khai và nội dung chính quy.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            {/* Thanh 1: Public */}
            <div>
              <div className="flex justify-between text-label-sm mb-1">
                <span className="text-on-surface-variant font-medium">Bộ thẻ Công khai (Public)</span>
                <span className="font-bold text-on-surface">
                  {decks.public} / {deckTotal} · {deckPublicPct}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-container-low overflow-hidden">
                <div
                  style={{ width: `${deckPublicPct}%` }}
                  className="h-full bg-primary-container rounded-full transition-all duration-500"
                />
              </div>
            </div>

            {/* Thanh 2: Official */}
            <div>
              <div className="flex justify-between text-label-sm mb-1">
                <span className="text-on-surface-variant font-medium">Bộ thẻ Chính quy (Official)</span>
                <span className="font-bold text-on-surface">
                  {decks.official} / {deckTotal} · {deckOfficialPct}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-container-low overflow-hidden">
                <div
                  style={{ width: `${deckOfficialPct}%` }}
                  className="h-full bg-secondary rounded-full transition-all duration-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-surface-container-high text-label-sm text-outline">
          Bộ thẻ Official do ban biên tập phát hành hoặc chứng thực.
        </div>
      </div>
    </div>
  );
};
