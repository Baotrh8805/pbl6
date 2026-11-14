import React from "react";
import { Link } from "react-router-dom";

// Ghi nguồn dữ liệu và giấy phép (spec 2026-10-26 §7.4, K10): JMdict / Tatoeba / KanjiVG / KRADFILE / kanjium đều yêu cầu ghi
// nguồn (CC BY / CC BY-SA) khi hiển thị cho người dùng. Trang công khai, không cần đăng nhập. Nội dung theo
// ai-service/app/extract/data/README.md.
const SOURCES: { name: string; url: string; use: string; license: string; licenseUrl: string }[] = [
  {
    name: "JMdict — Electronic Dictionary Research and Development Group (EDRDG)",
    url: "https://www.edrdg.org/jmdict/j_jmdict.html",
    use: "Mục từ, cách đọc, nghĩa tiếng Anh, từ loại (qua bản JSON jmdict-simplified)",
    license: "CC BY-SA 4.0 (EDRDG licence)",
    licenseUrl: "https://www.edrdg.org/edrdg/licence.html",
  },
  {
    name: "Tatoeba (qua JMdict_e_examp)",
    url: "https://tatoeba.org",
    use: "Câu ví dụ tiếng Nhật – Anh gắn với nghĩa của từ; bản dịch tiếng Việt của câu do NihonGen dịch (phái sinh, cùng giấy phép)",
    license: "CC BY 2.0 FR",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/fr/",
  },
  {
    name: "KanjiVG — © Ulrich Apel",
    url: "https://kanjivg.tagaini.net",
    use: "Nét viết chữ Hán cho luyện viết, chấm điểm và vẽ chữ để tra từ điển",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
  },
  {
    name: "KRADFILE — EDRDG (KRADFILE2 © Jim Rose)",
    url: "https://www.edrdg.org/krad/kradinf.html",
    use: "Thành phần cấu tạo chữ Hán (chữ giống hình)",
    license: "CC BY-SA 4.0 (EDRDG licence)",
    licenseUrl: "https://www.edrdg.org/edrdg/licence.html",
  },
  {
    name: "kanjium",
    url: "https://github.com/mifunetoshiro/kanjium",
    use: "Kiểu trọng âm cao thấp",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://github.com/mifunetoshiro/kanjium/blob/master/LICENSE.txt",
  },
  {
    name: "Unicode Unihan",
    url: "https://www.unicode.org/charts/unihan.html",
    use: "Âm Hán-Việt, âm On / Kun, bộ thủ, số nét, nghĩa của chữ",
    license: "Unicode License",
    licenseUrl: "https://www.unicode.org/license.txt",
  },
  {
    name: "Danh sách từ vựng JLPT — tanos.co.uk (qua elzup/jlpt-word-list)",
    url: "http://www.tanos.co.uk/jlpt/",
    use: "Cấp JLPT N5–N1 của từ",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  },
  {
    name: "SudachiDict — Works Applications",
    url: "https://github.com/WorksApplications/SudachiDict",
    use: "Tách từ, lemma, cách đọc",
    license: "Apache-2.0",
    licenseUrl: "https://www.apache.org/licenses/LICENSE-2.0",
  },
  {
    name: "wordfreq — Robyn Speer",
    url: "https://github.com/rspeer/wordfreq",
    use: "Tần suất từ",
    license: "MIT (dữ liệu CC BY-SA 4.0)",
    licenseUrl: "https://github.com/rspeer/wordfreq/blob/master/LICENSE.txt",
  },
];

export const DataSourcesPage: React.FC = () => (
  <main className="min-h-screen bg-surface px-4 py-8">
    <div className="max-w-3xl mx-auto flex flex-col gap-4">
      <h1 className="font-headline-md text-headline-md font-bold text-on-surface">Nguồn dữ liệu và giấy phép</h1>
      <p className="text-body-sm text-on-surface-variant">
        Từ điển, luyện viết và bóc tách tài liệu dùng các bộ dữ liệu mở dưới đây. Nghĩa tiếng Việt và bản dịch câu ví dụ do hệ thống
        tạo và được cộng đồng cùng quản trị viên hiệu đính; chúng được chia sẻ theo cùng giấy phép với dữ liệu gốc.
      </p>
      <p className="text-body-sm text-on-surface-variant">
        Câu bạn nhập ở tab Dịch của từ điển được gửi tới dịch vụ AI (Google Gemini) để dịch cả câu; bản dịch được giữ trong bộ nhớ dịch
        chung tối đa 30 ngày kể từ lần dùng cuối, không gắn với tài khoản của bạn. Phần phân tích từng cụm từ chạy trên máy chủ của hệ
        thống bằng dữ liệu mở (SudachiDict, JMdict, danh sách JLPT).
      </p>
      <ul className="flex flex-col gap-3">
        {SOURCES.map((s) => (
          <li key={s.name} className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-4">
            <a href={s.url} target="_blank" rel="noreferrer noopener" className="font-semibold text-primary hover:underline">{s.name}</a>
            <p className="text-body-sm text-on-surface mt-1">{s.use}</p>
            <p className="text-xs text-on-surface-variant mt-1">
              Giấy phép: <a href={s.licenseUrl} target="_blank" rel="noreferrer noopener" className="hover:underline">{s.license}</a>
            </p>
          </li>
        ))}
      </ul>
      <Link to="/" className="text-body-sm text-primary hover:underline self-start">← Về trang chính</Link>
    </div>
  </main>
);

export default DataSourcesPage;
