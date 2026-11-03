import React, { useMemo, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { fetchDecks, deleteDeck, moveDeckToFolder } from "@/services/deckService";
import { fetchFolders, createFolder, updateFolder, deleteFolder } from "@/services/folderService";
import { moveTargets, JLPT_LEVELS as LEVELS } from "@/lib/deckUtils";
import type { Deck, FolderNode, FolderDto } from "@/types/api.types";
import { useAsync } from "@/lib/useAsync";
import { Button } from "@/components/ui/Button";
import { FolderModal } from "@/features/decks/components/DeckModals";
import { AddExistingDeckModal } from "@/features/decks/components/AddExistingDeckModal";
import { DeckCard } from "@/features/decks/components/DeckCard";
import { DECK_PERIODS, DECK_SORTS, dueByDeck, filterDecks, isDeckPeriod, isDeckSort, sortDecks } from "@/features/decks/deckListUtils";
import { useShell } from "@/components/layout/shellContext";
import { useDialog } from "@/components/ui/dialogContext";
import { findFolder, getBreadcrumbs } from "@/features/folders/components/folderTree";


export const DecksPage: React.FC = () => {
    const navigate = useNavigate();
    const dialog = useDialog();
    const [params, setParams] = useSearchParams();
    const level = params.get("level") ?? "";
    const q = params.get("q") ?? "";
    const folderId = params.get("folderId") ?? "";
    // Rà soát 27/10: sắp xếp (mặc định mới cập nhật trước), lọc theo thời gian, lọc "cần ôn" (?filter=due từ badge / banner)
    const sortParam = params.get("sort");
    const sort = isDeckSort(sortParam) ? sortParam : "updated";
    const periodParam = params.get("period") ?? "";
    const period = isDeckPeriod(periodParam) ? periodParam : "";
    const dueOnly = params.get("filter") === "due";
    const { reviews } = useShell();

    // Refetch pattern: bump index to trigger useAsync reload
    const [refreshIndex, setRefreshIndex] = useState(0);
    const { data: decksData, error: decksError, loading: decksLoading } = useAsync(
        () => fetchDecks(folderId || null),
        [folderId, refreshIndex]
    );
    const { data: folderTree } = useAsync(fetchFolders, [refreshIndex]);

    // Folder Modal state: editingFolder != null -> chế độ sửa/di chuyển
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [editingFolder, setEditingFolder] = useState<FolderNode | null>(null);

    // Add Existing Deck Modal state
    const [isAddExistingModalOpen, setIsAddExistingModalOpen] = useState(false);
    const [folderForAddExisting, setFolderForAddExisting] = useState<{ id: string; title: string } | null>(null);

    const tree = folderTree || [];
    const currentFolder = folderId ? findFolder(tree, folderId) : null;
    const breadcrumbs = folderId ? getBreadcrumbs(tree, folderId) : [];
    const subfolders = currentFolder ? currentFolder.children || [] : tree;

    const dueMap = useMemo(() => dueByDeck(decksData ?? [], reviews), [decksData, reviews]);
    const dueDeckCount = Object.values(dueMap).filter((n) => n > 0).length;
    const decks = sortDecks(filterDecks(decksData ?? [], { q, level, period, dueOnly }, dueMap), sort);

    const setParam = (name: string, value: string) => {
        const next = new URLSearchParams(params);
        if (value) next.set(name, value);
        else next.delete(name);
        setParams(next, { replace: true });
    };

    const handleSaveFolder = async (dto: FolderDto) => {
        if (editingFolder) await updateFolder(editingFolder.id, dto);
        else await createFolder(dto);
        setRefreshIndex((n) => n + 1);
    };

    const openCreateFolder = () => {
        setEditingFolder(null);
        setIsFolderModalOpen(true);
    };

    const handleEditFolder = (e: React.MouseEvent, folder: FolderNode) => {
        e.stopPropagation();
        setEditingFolder(folder);
        setIsFolderModalOpen(true);
    };

    // Xoá theo ON DELETE SET NULL: thư mục con và bộ thẻ bên trong được đẩy lên gốc, không mất dữ liệu.
    const handleDeleteFolder = async (e: React.MouseEvent, folder: FolderNode) => {
        e.stopPropagation();
        const ok = await dialog.confirm({
            title: "Xoá thư mục?",
            message: `Thư mục "${folder.title}" sẽ bị xoá.
Thư mục con và bộ thẻ bên trong sẽ được chuyển ra ngoài cùng, không bị xoá.`,
            confirmLabel: "Xoá thư mục",
            tone: "danger",
            action: () => deleteFolder(folder.id),
        });
        if (!ok) return;
        if (folderId === folder.id) setParam("folderId", folder.parentId ?? "");
        setRefreshIndex((n) => n + 1);
    };

    const handleDeleteDeck = async (deck: Deck) => {
        const ok = await dialog.confirm({
            title: "Xoá bộ thẻ?",
            message: `Bộ thẻ "${deck.title}" và toàn bộ thẻ từ vựng bên trong sẽ bị xoá vĩnh viễn.`,
            confirmLabel: "Xoá bộ thẻ",
            tone: "danger",
            action: () => deleteDeck(deck.id),
        });
        if (ok) setRefreshIndex((n) => n + 1);
    };

    const handleRemoveFromFolder = async (deck: Deck, folder: FolderNode) => {
        const ok = await dialog.confirm({
            title: "Đưa bộ thẻ ra khỏi thư mục?",
            message: `Bộ thẻ "${deck.title}" sẽ được chuyển từ thư mục "${folder.title}" về danh sách ngoài cùng.`,
            confirmLabel: "Chuyển ra ngoài",
            tone: "warning",
            action: () => moveDeckToFolder(deck, null),
        });
        if (ok) setRefreshIndex((n) => n + 1);
    };

    return (
        <section className="flex flex-col gap-space-lg pb-space-xl">
            {/* Header: Title & Action Buttons */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                        {currentFolder ? currentFolder.title : "Bộ thẻ của tôi"}
                    </h1>
                    <p className="text-body-sm text-on-surface-variant mt-0.5">
                        {currentFolder
                            ? currentFolder.description || "Quản lý các bộ thẻ bên trong thư mục này"
                            : "Danh sách tất cả các bộ thẻ từ vựng và Kanji luyện thi JLPT của bạn"}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Link
                        to="/folders"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-lowest hover:bg-surface-container text-primary font-label-md text-label-md transition-colors shadow-2xs border border-surface-container-high"
                        title="Quản lý cây thư mục và không gian học tập"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">folder</span>
                        <span>Không gian Thư mục</span>
                    </Link>

                    {currentFolder && (
                        <Button
                            variant="outline"
                            size="md"
                            onClick={() => {
                                setFolderForAddExisting({ id: currentFolder.id, title: currentFolder.title });
                                setIsAddExistingModalOpen(true);
                            }}
                            className="cursor-pointer shadow-xs border-primary/30 text-primary hover:bg-surface-container"
                            title="Chọn bộ thẻ có sẵn hoặc từ thư viện để đưa vào thư mục này"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">playlist_add</span>
                            Thêm bộ thẻ có sẵn
                        </Button>
                    )}

                    <Button
                        variant="primary"
                        size="md"
                        onClick={() =>
                            navigate(folderId ? `/decks/new?folderId=${encodeURIComponent(folderId)}` : "/decks/new")
                        }
                        className="cursor-pointer shadow-xs"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
                        Tạo bộ thẻ mới
                    </Button>

                    <Link
                        to="/library"
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary font-label-md text-label-md transition-colors shadow-2xs border border-surface-container-high/60"
                        title="Khám phá Thư viện bộ thẻ tinh tuyển"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">auto_stories</span>
                        <span>Thư viện bộ thẻ</span>
                    </Link>
                </div>
            </div>

            {/* Breadcrumbs Navigation */}
            <nav aria-label="Đường dẫn thư mục" className="flex items-center flex-wrap gap-1.5 text-body-sm">
                <button
                    type="button"
                    onClick={() => setParam("folderId", "")}
                    aria-current={!folderId ? "page" : undefined}
                    className={`inline-flex items-center gap-1 transition-colors ${
                        !folderId
                            ? "font-bold text-primary cursor-default"
                            : "text-on-surface-variant hover:text-primary cursor-pointer hover:underline"
                    }`}
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">folder_special</span>
                    Tất cả bộ thẻ
                </button>
                {breadcrumbs.map((bc, idx) => {
                    const isLast = idx === breadcrumbs.length - 1;
                    return (
                        <React.Fragment key={bc.id}>
                            <span className="text-outline/60">/</span>
                            <button
                                type="button"
                                disabled={isLast}
                                aria-current={isLast ? "page" : undefined}
                                onClick={() => setParam("folderId", bc.id)}
                                className={`inline-flex items-center gap-1 transition-colors ${
                                    isLast
                                        ? "font-bold text-primary cursor-default"
                                        : "text-on-surface-variant hover:text-primary cursor-pointer hover:underline"
                                }`}
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">folder</span>
                                {bc.title}
                            </button>
                        </React.Fragment>
                    );
                })}
            </nav>

            {/* Subfolders Section */}
            {subfolders.length > 0 && (
                <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-outline">
                            {currentFolder ? `Thư mục con trong "${currentFolder.title}"` : "Thư mục của bạn"} ({subfolders.length})
                        </h2>
                    </div>

                    {/* Cùng số cột với lưới bộ thẻ: 4 cột làm ô thư mục quá hẹp, tên bị ép mất (27/10) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {subfolders.map((f) => (
                            <div
                                key={f.id}
                                className="flex items-center justify-between gap-2.5 p-3.5 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low border border-surface-container-high/70 hover:border-primary/50 transition-all group shadow-2xs hover:shadow-xs"
                            >
                                <button
                                    type="button"
                                    onClick={() => setParam("folderId", f.id)}
                                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
                                >
                                    <span aria-hidden="true" className="material-symbols-outlined text-primary text-[26px] group-hover:scale-110 transition-transform shrink-0">
                                        folder
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-sm text-on-surface truncate group-hover:text-primary transition-colors">
                                            {f.title}
                                        </div>
                                        <div className="text-[11px] text-outline truncate">
                                            {f.children?.length ? `${f.children.length} thư mục con` : f.level || "Thư mục"}
                                        </div>
                                    </div>
                                </button>
                                <div className="flex items-center shrink-0">
                                    <button
                                        type="button"
                                        title={`Thêm bộ thẻ vào "${f.title}"`}
                                        aria-label={`Thêm bộ thẻ vào thư mục "${f.title}"`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setFolderForAddExisting({ id: f.id, title: f.title });
                                            setIsAddExistingModalOpen(true);
                                        }}
                                        className="p-1.5 rounded-lg text-outline hover:text-secondary hover:bg-surface-container transition-colors cursor-pointer"
                                    >
                                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">playlist_add</span>
                                    </button>
                                    <button
                                        type="button"
                                        title="Đổi tên / di chuyển"
                                        aria-label={`Đổi tên / di chuyển thư mục "${f.title}"`}
                                        onClick={(e) => handleEditFolder(e, f)}
                                        className="p-1.5 rounded-lg text-outline hover:text-primary hover:bg-surface-container transition-colors cursor-pointer"
                                    >
                                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">edit</span>
                                    </button>
                                    <button
                                        type="button"
                                        title="Xoá thư mục"
                                        aria-label={`Xoá thư mục "${f.title}"`}
                                        onClick={(e) => handleDeleteFolder(e, f)}
                                        className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-surface-container transition-colors cursor-pointer"
                                    >
                                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">delete</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-space-sm">
                <label className="sr-only" htmlFor="deck-search">
                    Tìm bộ thẻ
                </label>
                <input
                    id="deck-search"
                    type="text"
                    enterKeyHint="search"
                    value={q}
                    onChange={(e) => setParam("q", e.target.value)}
                    placeholder="Tìm bộ thẻ..."
                    className="px-3 py-2 rounded-lg bg-surface-container-lowest border border-surface-container-high text-body-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-w-[220px]"
                />
                <label className="sr-only" htmlFor="deck-level">
                    Lọc theo trình độ JLPT
                </label>
                <select
                    id="deck-level"
                    value={level}
                    onChange={(e) => setParam("level", e.target.value)}
                    className="px-3 py-2 rounded-lg bg-surface-container-lowest border border-surface-container-high text-body-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    <option value="">Mọi trình độ</option>
                    {LEVELS.map((l) => (
                        <option key={l} value={l}>
                            {l}
                        </option>
                    ))}
                </select>
                <label className="sr-only" htmlFor="deck-period">
                    Lọc theo thời gian cập nhật
                </label>
                <select
                    id="deck-period"
                    value={period}
                    onChange={(e) => setParam("period", e.target.value)}
                    className="px-3 py-2 rounded-lg bg-surface-container-lowest border border-surface-container-high text-body-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    {DECK_PERIODS.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
                <label className="sr-only" htmlFor="deck-sort">
                    Sắp xếp
                </label>
                <select
                    id="deck-sort"
                    value={sort}
                    onChange={(e) => setParam("sort", e.target.value === "updated" ? "" : e.target.value)}
                    className="px-3 py-2 rounded-lg bg-surface-container-lowest border border-surface-container-high text-body-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    {DECK_SORTS.map((o) => (
                        <option key={o.value} value={o.value}>
                            Xếp: {o.label}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    aria-pressed={dueOnly}
                    onClick={() => setParam("filter", dueOnly ? "" : "due")}
                    title="Chỉ hiện bộ thẻ có thẻ đã học đến hạn ôn"
                    className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-label-md font-semibold transition-colors cursor-pointer ${
                        dueOnly
                            ? "bg-error/10 border-error/40 text-error"
                            : "bg-surface-container-lowest border-surface-container-high text-on-surface-variant hover:text-on-surface"
                    }`}
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">event_repeat</span>
                    Cần ôn{dueDeckCount > 0 ? ` (${dueDeckCount})` : ""}
                </button>
            </div>

            {/* State messages */}
            <div aria-live="polite">
                {decksLoading && <p className="text-on-surface-variant">Đang tải bộ thẻ...</p>}
                {decksError && <p className="text-error">{decksError}</p>}
                {!decksLoading && !decksError && decks.length === 0 && (
                    <div className="p-8 text-center rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container-high flex flex-col items-center gap-3">
                        <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-outline">style</span>
                        <p className="text-body-md text-on-surface-variant">
                            {dueOnly
                                ? "Không có bộ thẻ nào cần ôn lúc này. Tuyệt vời!"
                                : currentFolder
                                ? subfolders.length === 0
                                    ? `Thư mục "${currentFolder.title}" đang trống.`
                                    : `Chưa có bộ thẻ nào trong thư mục "${currentFolder.title}".`
                                : "Không có bộ thẻ nào khớp với tiêu chí tìm kiếm."}
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                            <Button variant="outline" size="sm" onClick={openCreateFolder}>
                                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">create_new_folder</span>
                                Thêm thư mục con
                            </Button>
                            {currentFolder && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setFolderForAddExisting({ id: currentFolder.id, title: currentFolder.title });
                                        setIsAddExistingModalOpen(true);
                                    }}
                                    className="border-primary/40 text-primary"
                                >
                                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">playlist_add</span>
                                    Thêm bộ thẻ có sẵn
                                </Button>
                            )}
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() =>
                                    navigate(folderId ? `/decks/new?folderId=${encodeURIComponent(folderId)}` : "/decks/new")
                                }
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">add</span>
                                Tạo bộ thẻ tại đây
                            </Button>
                            <Link
                                to="/library"
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-primary transition-colors"
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">auto_stories</span>
                                Chọn từ Thư viện
                            </Link>
                        </div>
                    </div>
                )}
            </div>

            {/* Decks Grid: thẻ gọn (đề xuất 27/10), thao tác trong menu ⋯ của từng thẻ */}
            {decks.length > 0 && (
                <ul className="grid gap-space-md sm:grid-cols-2 lg:grid-cols-3">
                    {decks.map((deck) => (
                        <DeckCard
                            key={deck.id}
                            deck={deck}
                            dueCount={dueMap[deck.id] ?? 0}
                            inFolder={!!currentFolder}
                            onDelete={(d) => void handleDeleteDeck(d)}
                            onRemoveFromFolder={currentFolder ? (d) => void handleRemoveFromFolder(d, currentFolder) : undefined}
                        />
                    ))}
                </ul>
            )}

            {/* Folder Modal: tạo mới, hoặc đổi tên + di chuyển khi editingFolder != null */}
            <FolderModal
                isOpen={isFolderModalOpen}
                onClose={() => setIsFolderModalOpen(false)}
                parentFolder={currentFolder}
                folder={editingFolder}
                moveTargets={editingFolder ? moveTargets(tree, editingFolder.id) : []}
                onSave={handleSaveFolder}
            />

            {/* Add Existing Deck Modal: Thêm bộ thẻ có sẵn hoặc từ thư viện vào thư mục */}
            {folderForAddExisting && (
                <AddExistingDeckModal
                    isOpen={isAddExistingModalOpen}
                    onClose={() => {
                        setIsAddExistingModalOpen(false);
                        setFolderForAddExisting(null);
                    }}
                    targetFolder={folderForAddExisting}
                    onSuccess={() => setRefreshIndex((n) => n + 1)}
                />
            )}
        </section>
    );
};

export default DecksPage;
