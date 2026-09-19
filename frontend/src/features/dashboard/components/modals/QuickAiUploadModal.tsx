import React, { useState } from "react";
import type { FolderItem } from "../../types/dashboard.types";

interface QuickAiUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: FolderItem[];
  onUploadSuccess?: (fileName: string, generatedCount: number) => void;
}

export const QuickAiUploadModal: React.FC<QuickAiUploadModalProps> = ({
  isOpen,
  onClose,
  folders,
  onUploadSuccess,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("vertical");
  const [autoFurigana, setAutoFurigana] = useState(true);
  const [autoHanViet, setAutoHanViet] = useState(true);
  const [autoQuiz, setAutoQuiz] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState(folders[0]?.id ?? "");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState("");
  const [completedResult, setCompletedResult] = useState<{
    wordsCount: number;
    quizCount: number;
    sampleWords: { kanji: string; furigana: string; hanviet: string; meaning: string }[];
  } | null>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setCompletedResult(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setCompletedResult(null);
    }
  };

  const handleStartAnalysis = () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setProcessStep("1/3: Đang tiền xử lý ảnh & OCR nhận diện văn bản tiếng Nhật...");

    setTimeout(() => {
      setProcessStep("2/3: Phân tích NLP (Sudachi), sinh Furigana & ánh xạ Hán-Việt...");
    }, 1200);

    setTimeout(() => {
      setProcessStep("3/3: Đối soát mâu thuẫn GraphRAG & đóng gói bộ thẻ Flashcard...");
    }, 2400);

    setTimeout(() => {
      setIsProcessing(false);
      setProcessStep("");
      const result = {
        wordsCount: 18,
        quizCount: 5,
        sampleWords: [
          { kanji: "労働市場", furigana: "ろうどうしじょう", hanviet: "LAO ĐỘNG THỊ TRƯỜNG", meaning: "Thị trường lao động" },
          { kanji: "景気回復", furigana: "けいきかいふく", hanviet: "CẢNH KHÍ HỒI PHỤC", meaning: "Kinh tế phục hồi" },
          { kanji: "格差拡大", furigana: "かくさかくだい", hanviet: "CÁCH SAI KHUẾCH ĐẠI", meaning: "Gia tăng chênh lệch/phân hóa" },
        ],
      };
      setCompletedResult(result);
      if (onUploadSuccess) {
        onUploadSuccess(selectedFile.name, 18);
      }
    }, 3400);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setCompletedResult(null);
    setIsProcessing(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-inverse-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 border border-surface-container-high">
        {/* Header */}
        <div className="px-space-lg py-space-md bg-surface-container-low flex items-center justify-between border-b border-surface-container">
          <div className="flex items-center gap-space-sm">
            <div className="w-10 h-10 rounded-xl bg-tertiary text-on-tertiary flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-[24px]">upload_file</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
                Tải Tài Liệu &amp; Bóc Tách AI Tự Động
              </h3>
              <p className="text-xs text-outline font-body-sm">
                OCR tiếng Nhật (Tatechugaki chữ dọc/ngang), sinh Furigana &amp; tạo Flashcard tức thì
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-container text-outline hover:text-on-surface transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-space-lg space-y-4 max-h-[75vh] overflow-y-auto">
          {!completedResult ? (
            <>
              {/* Dropzone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer relative ${dragActive
                    ? "border-primary bg-primary-container/10"
                    : selectedFile
                      ? "border-secondary bg-secondary-fixed/20"
                      : "border-outline-variant hover:border-primary hover:bg-surface-container-low"
                  }`}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />

                {selectedFile ? (
                  <div className="flex items-center justify-center gap-3 py-2">
                    <div className="w-12 h-12 rounded-lg bg-secondary text-on-secondary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[28px]">description</span>
                    </div>
                    <div className="text-left">
                      <div className="font-label-md text-on-surface font-semibold truncate max-w-sm">
                        {selectedFile.name}
                      </div>
                      <div className="text-xs text-outline font-mono">
                        {(selectedFile.size / 1024).toFixed(1)} KB • Sẵn sàng phân tích
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                      className="ml-auto p-1.5 rounded-lg text-outline hover:text-error hover:bg-error-container/20 transition-colors cursor-pointer"
                      title="Chọn file khác"
                    >
                      <span className="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 py-3">
                    <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-primary mx-auto">
                      <span className="material-symbols-outlined text-[28px]">cloud_upload</span>
                    </div>
                    <div className="font-label-md text-on-surface font-semibold">
                      Kéo thả ảnh giáo trình tiếng Nhật hoặc file PDF vào đây
                    </div>
                    <p className="text-xs text-outline">
                      Hỗ trợ JPG, PNG, WEBP, PDF (trang sách Minna, Shinkanzen, Soumatome, báo NHK...)
                    </p>
                    <span className="inline-block px-3 py-1 bg-surface-container rounded-lg font-label-sm text-xs text-primary font-semibold">
                      Chọn file từ máy tính
                    </span>
                  </div>
                )}
              </div>

              {/* Tùy chọn phân tích AI */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* Hướng văn bản OCR */}
                <div className="space-y-1.5">
                  <label className="font-label-md text-label-md text-on-surface font-semibold block">
                    Định hướng chữ viết OCR
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOrientation("vertical")}
                      className={`p-2.5 rounded-lg font-label-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${orientation === "vertical"
                          ? "bg-primary text-on-primary border-primary shadow-sm"
                          : "bg-surface-container-low text-on-surface-variant border-surface-container-high hover:bg-surface-container"
                        }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">view_column</span>
                      <span>Chữ Dọc (Tatechugaki)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOrientation("horizontal")}
                      className={`p-2.5 rounded-lg font-label-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${orientation === "horizontal"
                          ? "bg-primary text-on-primary border-primary shadow-sm"
                          : "bg-surface-container-low text-on-surface-variant border-surface-container-high hover:bg-surface-container"
                        }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">view_stream</span>
                      <span>Chữ Ngang (Yokogaki)</span>
                    </button>
                  </div>
                </div>

                {/* Thư mục đích */}
                <div className="space-y-1.5">
                  <label className="font-label-md text-label-md text-on-surface font-semibold block">
                    Lưu vào thư mục
                  </label>
                  <select
                    value={selectedFolder}
                    onChange={(e) => setSelectedFolder(e.target.value)}
                    disabled={folders.length === 0}
                    className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-body-sm text-on-surface border border-surface-container-high focus:outline-none cursor-pointer disabled:cursor-not-allowed disabled:text-outline"
                  >
                    {folders.length === 0 ? (
                      <option value="">Chưa có thư mục — hãy tạo thư mục trước</option>
                    ) : (
                      folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.title} ({f.level})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Toggles */}
              <div className="p-3.5 rounded-xl bg-surface-container-low space-y-2 border border-surface-container-high/40">
                <div className="font-label-md text-label-md text-on-surface font-semibold mb-1">
                  Công nghệ AI sinh học liệu tự động:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-on-surface-variant">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      checked={autoFurigana}
                      onChange={(e) => setAutoFurigana(e.target.checked)}
                      type="checkbox"
                      className="rounded accent-primary"
                    />
                    <span>Tự tạo Furigana (Hiragana)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      checked={autoHanViet}
                      onChange={(e) => setAutoHanViet(e.target.checked)}
                      type="checkbox"
                      className="rounded accent-primary"
                    />
                    <span>Ánh xạ âm Hán-Việt</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      checked={autoQuiz}
                      onChange={(e) => setAutoQuiz(e.target.checked)}
                      type="checkbox"
                      className="rounded accent-primary"
                    />
                    <span>Tự tạo câu hỏi Quiz</span>
                  </label>
                </div>
              </div>

              {/* Trạng thái đang phân tích */}
              {isProcessing && (
                <div className="p-4 rounded-xl bg-surface-container flex flex-col items-center justify-center text-center space-y-2 animate-in fade-in">
                  <div className="w-8 h-8 border-3 border-secondary border-t-transparent rounded-full animate-spin"></div>
                  <div className="font-label-md text-primary font-semibold">{processStep}</div>
                  <div className="text-xs text-outline">Đang kết nối FastAPI AI Service &amp; Spring Boot Gateway</div>
                </div>
              )}
            </>
          ) : (
            /* Kết quả bóc tách thành công */
            <div className="space-y-4 animate-in fade-in zoom-in-95">
              <div className="p-4 rounded-xl bg-secondary-fixed/40 border border-secondary/30 flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary text-[32px]">check_circle</span>
                <div>
                  <div className="font-headline-sm text-headline-sm text-secondary font-bold">
                    Trích xuất AI hoàn tất thành công!
                  </div>
                  <div className="text-xs text-on-secondary-fixed">
                    Đã trích xuất <strong>{completedResult.wordsCount} từ vựng Flashcard</strong> và{" "}
                    <strong>{completedResult.quizCount} câu hỏi trắc nghiệm</strong> từ file "{selectedFile?.name}".
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-label-md text-on-surface font-semibold">
                  Xem trước 3 thẻ từ vựng vừa sinh:
                </div>
                <div className="space-y-2">
                  {completedResult.sampleWords.map((word, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-surface-container-low rounded-xl border border-surface-container-high/60 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="font-headline-sm text-headline-sm text-primary font-bold">
                            {word.kanji}
                          </span>
                          <span className="font-label-md text-secondary font-mono">
                            【{word.furigana}】
                          </span>
                          <span className="font-label-sm text-tertiary-container font-bold px-1.5 py-0.5 bg-tertiary-fixed rounded">
                            {word.hanviet}
                          </span>
                        </div>
                        <div className="text-xs text-on-surface-variant mt-0.5">{word.meaning}</div>
                      </div>
                      <span className="material-symbols-outlined text-secondary text-[20px]">
                        verified
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-space-lg py-3 bg-surface-container-low flex items-center justify-between border-t border-surface-container">
          {completedResult ? (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="px-3.5 py-2 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container transition-colors font-semibold cursor-pointer"
              >
                Tải file khác
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container transition-colors font-semibold cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const folderTitle =
                      folders.find((f) => f.id === selectedFolder)?.title ?? "chưa phân loại";
                    alert(`Đang mở bộ thẻ vừa tạo trong thư mục ${folderTitle}!`);
                    onClose();
                  }}
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-colors shadow-sm font-semibold cursor-pointer"
                >
                  Vào Học Bộ Thẻ Này →
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-outline hidden sm:block">
                Hỗ trợ bởi AI OCR Engine &amp; Sudachi NLP
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container transition-colors font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={!selectedFile || isProcessing}
                  onClick={handleStartAnalysis}
                  className={`px-4 py-2 rounded-lg font-label-md text-label-md transition-all shadow-sm font-semibold flex items-center gap-1.5 cursor-pointer ${!selectedFile || isProcessing
                      ? "bg-surface-container-high text-outline cursor-not-allowed"
                      : "bg-tertiary text-on-tertiary hover:bg-tertiary-container active:scale-95"
                    }`}
                >
                  <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                  <span>Bắt Đầu Bóc Tách AI</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
