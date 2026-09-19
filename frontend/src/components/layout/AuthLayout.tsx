import React from "react";
import { Link } from "react-router-dom";
import { Sparkles, Quote } from "lucide-react";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  title,
  subtitle,
}) => {
  return (
    <div className="min-h-screen bg-surface font-body text-on-surface flex flex-col justify-between selection:bg-secondary-container selection:text-on-secondary-container relative overflow-x-hidden">
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(183,198,238,0.35),transparent_70%)]"></div>

      {/* Header */}
      <header className="w-full z-40 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30">
        <div className="h-16 max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group focus:outline-none">
            {/* NihonGen AI Logo Emblem */}
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
              <span className="font-kanji font-bold text-lg text-tertiary-fixed">日</span>
            </div>
            <span className="font-headline font-bold text-xl text-primary tracking-tight">
              NihonGen <span className="text-tertiary font-extrabold">AI</span>
            </span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center w-full px-4 md:px-8 py-8 md:py-12 relative z-10">
        <div className="w-full max-w-6xl mx-auto my-auto rounded-2xl overflow-hidden shadow-xl bg-surface-container-lowest grid grid-cols-1 lg:grid-cols-12 min-h-[640px] border border-outline-variant/30">
          
          {/* LEFT COLUMN: Brand Showcase & Japanese Philosophy (Desktop) */}
          <div className="lg:col-span-5 relative bg-primary text-white flex flex-col justify-between p-6 lg:p-10 overflow-hidden">
            {/* Subtle glow circles */}
            <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-tertiary/15 blur-3xl pointer-events-none"></div>
            <div className="absolute -left-12 -bottom-12 w-64 h-64 rounded-full bg-secondary/20 blur-3xl pointer-events-none"></div>
            
            {/* Watermark Kanji 学 (Gaku - Study) */}
            <div className="absolute right-4 bottom-8 select-none pointer-events-none opacity-5 font-kanji text-[180px] leading-none text-white">
              学
            </div>

            {/* Top Brand Pill & Slogan */}
            <div className="relative z-10 flex flex-col gap-4">
              <div className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
                <span className="w-2 h-2 rounded-full bg-secondary-fixed animate-pulse"></span>
                <span className="font-mono text-xs tracking-wider uppercase text-surface-container-highest">
                  AI-Powered EdTech 3.0
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <h2 className="font-headline text-2xl lg:text-3xl font-bold text-white tracking-tight leading-snug">
                  Biến tài liệu tiếng Nhật thành{" "}
                  <span className="text-tertiary-fixed underline decoration-tertiary-fixed-dim/50 decoration-wavy underline-offset-4">
                    Flashcard & Đề thi
                  </span>{" "}
                  trong 8 giây.
                </h2>
                <p className="font-body text-sm text-surface-container-high leading-relaxed opacity-90">
                  Phân tích ngữ pháp chuyên sâu, giải nghĩa Hán tự đa ngữ và chu trình lặp lại ngắt quãng tối ưu riêng cho người Việt.
                </p>
              </div>

              {/* Mini Flashcard Interactive Card Preview */}
              <div className="mt-2 p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-left">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                  <div className="flex items-center gap-1.5 text-xs text-tertiary-fixed font-medium">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Tự động trích xuất AI</span>
                  </div>
                  <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-tertiary text-white font-semibold">
                    JLPT N2
                  </span>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="font-kanji text-2xl font-bold text-white tracking-wide">
                    克服
                  </span>
                  <span className="font-body text-xs text-surface-container-high">
                    こくふく • Khắc phục
                  </span>
                </div>

                <p className="text-xs text-surface-container-high/90 mt-1 italic font-body">
                  「どんな困難でも克服できる。」 (Bất kỳ khó khăn nào cũng có thể vượt qua.)
                </p>
              </div>
            </div>

            {/* Live Stats Metrics */}
            <div className="relative z-10 grid grid-cols-3 gap-2 my-4 py-3 bg-white/5 backdrop-blur-sm rounded-xl px-3 border border-white/5">
              <div className="flex flex-col text-center">
                <span className="font-headline text-xl font-bold text-white tracking-tight">45K+</span>
                <span className="font-body text-[11px] text-surface-container-high">Học viên</span>
              </div>
              <div className="flex flex-col text-center border-x border-white/10">
                <span className="font-headline text-xl font-bold text-white tracking-tight">1.2M+</span>
                <span className="font-body text-[11px] text-surface-container-high">Thẻ AI sinh</span>
              </div>
              <div className="flex flex-col text-center">
                <span className="font-headline text-xl font-bold text-secondary-fixed tracking-tight">98.4%</span>
                <span className="font-body text-[11px] text-surface-container-high">Chuẩn xác</span>
              </div>
            </div>

            {/* Bottom Japanese Philosophical Quote */}
            <div className="relative z-10 pt-2 border-t border-white/10">
              <div className="flex items-start gap-2.5">
                <Quote className="w-5 h-5 text-tertiary-fixed shrink-0 rotate-180 opacity-80" />
                <div>
                  <p className="font-headline text-sm font-semibold text-white tracking-wide">
                    「継続は力なり」
                  </p>
                  <p className="font-body text-xs text-surface-container-high opacity-85">
                    Keizoku wa chikara nari — <span className="text-white font-medium">Kiên trì chính là sức mạnh.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Form Container */}
          <div className="lg:col-span-7 p-6 sm:p-10 lg:p-12 flex flex-col justify-center bg-surface-container-lowest">
            <div className="w-full max-w-md mx-auto flex flex-col gap-6">
              
              {/* Form Heading */}
              <div className="flex flex-col gap-1 text-left">
                <h1 className="font-headline text-2xl sm:text-3xl font-bold text-primary tracking-tight">
                  {title}
                </h1>
                {subtitle && (
                  <p className="font-body text-sm text-on-surface-variant">
                    {subtitle}
                  </p>
                )}
              </div>

              {/* Form Content */}
              {children}
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-4 text-center text-xs text-on-surface-variant border-t border-outline-variant/30">
        <p>© 2026 NihonGen AI • Đồ án tốt nghiệp PBL6 • Đại học Bách Khoa - Đại học Đà Nẵng</p>
      </footer>
    </div>
  );
};
