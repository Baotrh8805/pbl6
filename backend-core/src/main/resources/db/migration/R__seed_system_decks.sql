-- Bộ thẻ Thư viện cộng đồng (public), thuộc tài khoản đăng tải tạo ở V3.
-- Repeatable migration: Flyway chạy lại khi nội dung file đổi (sau mọi migration V*).
-- ON CONFLICT DO NOTHING: không ghi đè bản đã có trên DB (chủ bộ thẻ có thể đã sửa).
-- Tên file giữ nguyên: Flyway báo lỗi nếu repeatable đã chạy biến mất khỏi thư mục migration.

INSERT INTO decks (id, title, level, description, owner_id, visibility, category, is_official, is_featured) VALUES
  ('n5-core', 'Từ vựng N5 cơ bản', 'N5', '20 từ nền tảng: thiên nhiên, con người, sinh hoạt hằng ngày.', (SELECT id FROM users WHERE lower(email) = 'dongocle2404@gmail.com'), 'public', 'goi', true, false),
  ('n4-society', 'Từ vựng N4 – xã hội & kinh tế', 'N4', 'Nhóm từ Hán tự hay gặp trong bài đọc trình độ N4.', (SELECT id FROM users WHERE lower(email) = 'dongocle2404@gmail.com'), 'public', 'goi', true, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO flashcards (id, deck_id, term, reading, meaning, position)
SELECT id, deck_id, term, reading,
       CASE WHEN example IS NULL OR example = '' THEN meaning ELSE meaning || chr(10) || chr(10) || example END, position
FROM (VALUES
  ('n5-1',  'n5-core', '水',   'みず',     'nước',               '水を飲みます。',      1),
  ('n5-2',  'n5-core', '火',   'ひ',       'lửa',                '火が強いです。',      2),
  ('n5-3',  'n5-core', '山',   'やま',     'núi',                '山に登ります。',      3),
  ('n5-4',  'n5-core', '川',   'かわ',     'sông',               '川で泳ぎます。',      4),
  ('n5-5',  'n5-core', '人',   'ひと',     'người',              'あの人は先生です。',  5),
  ('n5-6',  'n5-core', '犬',   'いぬ',     'con chó',            '犬が好きです。',      6),
  ('n5-7',  'n5-core', '猫',   'ねこ',     'con mèo',            '猫は静かです。',      7),
  ('n5-8',  'n5-core', '本',   'ほん',     'sách',               '本を読みます。',      8),
  ('n5-9',  'n5-core', '車',   'くるま',   'xe hơi',             '車で行きます。',      9),
  ('n5-10', 'n5-core', '学校', 'がっこう', 'trường học',         '学校は近いです。',    10),
  ('n5-11', 'n5-core', '先生', 'せんせい', 'giáo viên',          '先生に聞きます。',    11),
  ('n5-12', 'n5-core', '学生', 'がくせい', 'học sinh, sinh viên','私は学生です。',      12),
  ('n5-13', 'n5-core', '友達', 'ともだち', 'bạn bè',             '友達と話します。',    13),
  ('n5-14', 'n5-core', '家族', 'かぞく',   'gia đình',           '家族は四人です。',    14),
  ('n5-15', 'n5-core', '時間', 'じかん',   'thời gian',          '時間がありません。',  15),
  ('n5-16', 'n5-core', '毎日', 'まいにち', 'mỗi ngày',           '毎日勉強します。',    16),
  ('n5-17', 'n5-core', '食べる', 'たべる', 'ăn',                 'パンを食べる。',      17),
  ('n5-18', 'n5-core', '飲む', 'のむ',     'uống',               'お茶を飲む。',        18),
  ('n5-19', 'n5-core', '行く', 'いく',     'đi',                 '東京へ行く。',        19),
  ('n5-20', 'n5-core', '見る', 'みる',     'nhìn, xem',          '映画を見る。',        20),
  ('n4-1', 'n4-society', '経済', 'けいざい',   'kinh tế',    NULL, 1),
  ('n4-2', 'n4-society', '社会', 'しゃかい',   'xã hội',     NULL, 2),
  ('n4-3', 'n4-society', '研究', 'けんきゅう', 'nghiên cứu', NULL, 3),
  ('n4-4', 'n4-society', '産業', 'さんぎょう', 'công nghiệp',NULL, 4),
  ('n4-5', 'n4-society', '輸出', 'ゆしゅつ',   'xuất khẩu',  NULL, 5),
  ('n4-6', 'n4-society', '準備', 'じゅんび',   'chuẩn bị',   NULL, 6)
) AS v(id, deck_id, term, reading, meaning, example, position)
ON CONFLICT (id) DO NOTHING;

-- Chuyển từ frontend/src/data/libraryDecks.ts (đã xoá). Id thẻ = <id bộ thẻ>-<vị trí>.
INSERT INTO decks (id, title, level, description, owner_id, visibility, category, is_official, is_featured) VALUES
  ('lib-n2-grammar-100', '100 Mẫu Ngữ Pháp N2 Xuất Hiện Tần Suất Cao Trong 10 Năm Qua', 'N2', 'Tổng hợp và phân tích mẫu câu bẫy từ các kỳ thi JLPT 2013-2024. Đính kèm ví dụ đa ngữ cảnh đời sống công sở, audio phát âm bản xứ và mẹo loại trừ đáp án nhiễu.', (SELECT id FROM users WHERE lower(email) = 'dongocle2404@gmail.com'), 'public', 'bunpou', true, true),
  ('lib-shinkanzen-n2-dokkai', 'Shinkanzen Master N2 Dokkai - Từ Vựng Then Chốt', 'N2', 'Trích xuất 450 cụm liên kết và từ vựng chuyển tiếp mấu chốt để xử lý nhanh bài đọc dài và đọc hiểu so sánh N2.', (SELECT id FROM users WHERE lower(email) = 'dongocle2404@gmail.com'), 'public', 'dokkai', true, false),
  ('lib-it-brse-words', 'Thuật Ngữ CNTT & Giao Tiếp BrSE Chuẩn Doanh Nghiệp', 'N2', 'Tuyển tập 250 thuật ngữ chuyên ngành công nghệ, quy trình phát triển Agile, Scrum, review pull request và cách phản hồi khách hàng Nhật.', (SELECT id FROM users WHERE lower(email) = 'dongocle2404@gmail.com'), 'public', 'it', false, false),
  ('lib-kanji-214-radicals', '214 Bộ Thủ & 500 Kanji N2 Trọng Điểm Có Mẹo Nhớ', 'N2', 'Phân tích cấu tạo chữ Hán, âm Hán Việt, On/Kun yomi và câu chuyện gợi nhớ hình ảnh để không bao giờ nhầm lẫn mặt chữ.', (SELECT id FROM users WHERE lower(email) = 'dongocle2404@gmail.com'), 'public', 'kanji', false, false),
  ('lib-soumatome-n3-goi', 'Nihongo Soumatome N3 Goi - Trọn Bộ 6 Tuần Tinh Gọn', 'N3', 'Tập hợp từ vựng N3 phân chia theo chủ đề sinh hoạt hằng ngày, siêu thị, nhà ga, bệnh viện và công sở Nhật Bản.', (SELECT id FROM users WHERE lower(email) = 'dongocle2404@gmail.com'), 'public', 'goi', true, false),
  ('lib-nhk-easy-news', 'Đọc Báo NHK News Web Easy & Từ Vựng Thời Sự Mới Nhất', 'N3', 'Trích xuất tự động qua AI từ bài báo thời sự thực tế: Phân tích ngữ cảnh và phát âm pitch accent chuẩn NHK.', (SELECT id FROM users WHERE lower(email) = 'dongocle2404@gmail.com'), 'public', 'dokkai', false, false),
  ('lib-business-keigo-n1', 'Kính Ngữ Keigo Thương Mại (BJT & JLPT N1)', 'N1', 'Tôn kính ngữ, khiêm nhường ngữ và văn phong thư tín thương mại chuẩn mực trong các tập đoàn Nhật Bản.', (SELECT id FROM users WHERE lower(email) = 'dongocle2404@gmail.com'), 'public', 'business', true, false),
  ('lib-minna-n5-core', 'Minna no Nihongo 50 Bài N5 - Nền Tảng Cho Người Mới Bắt Đầu', 'N5', 'Trọn vẹn hệ thống từ vựng vỡ lòng có ví dụ song ngữ Việt-Nhật, âm thanh minh họa và bảng chữ cái Kana.', (SELECT id FROM users WHERE lower(email) = 'dongocle2404@gmail.com'), 'public', 'kaiwa', true, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO flashcards (id, deck_id, term, reading, meaning, position)
SELECT id, deck_id, term, reading,
       CASE WHEN example IS NULL OR example = '' THEN meaning ELSE meaning || chr(10) || chr(10) || example END, position
FROM (VALUES
  ('lib-n2-grammar-100-1', 'lib-n2-grammar-100', '～を契機に', 'をけいきに', 'Nhân cơ hội, lấy làm bước ngoặt', '東京オリンピックを契機に、街の再開発が一気に進んだ。', 1),
  ('lib-n2-grammar-100-2', 'lib-n2-grammar-100', '～を皮切りに', 'をかわきりに', 'Khởi đầu bằng, mở màn với', '東京公演を皮切りに、全国ツアーがスタートした。', 2),
  ('lib-n2-grammar-100-3', 'lib-n2-grammar-100', '～にあたって', 'にあたって', 'Nhân dịp, trước thềm (sự kiện quan trọng)', '新学期を迎えるにあたって、目標を立てた。', 3),
  ('lib-n2-grammar-100-4', 'lib-n2-grammar-100', '～に伴って', 'にともなって', 'Cùng với, kéo theo sự biến đổi', '人口減少に伴って、空き家問題が深刻化している。', 4),
  ('lib-n2-grammar-100-5', 'lib-n2-grammar-100', '～に基づいて', 'にもとづいて', 'Dựa trên, căn cứ theo', '集めたデータに基づいて、計画を立て直す。', 5),
  ('lib-n2-grammar-100-6', 'lib-n2-grammar-100', '～に即して', 'にそくして', 'Hợp với, bám sát theo thực tế', '現状に即した解決策が求められている。', 6),
  ('lib-n2-grammar-100-7', 'lib-n2-grammar-100', '～を抜きにしては', 'をぬきにしては', 'Nếu không nhờ vào, không có', '皆さんの協力抜きにしては、成功はあり得なかった。', 7),
  ('lib-n2-grammar-100-8', 'lib-n2-grammar-100', '～に至るまで', 'にいたるまで', 'Đến tận cả, chi tiết tới tận', '服装から言葉遣いに至るまで、厳しく指導された。', 8),
  ('lib-shinkanzen-n2-dokkai-1', 'lib-shinkanzen-n2-dokkai', '反対に', 'はんたいに', 'Ngược lại (tương phản)', '前者は肯定的な意見だが、反対に後者は慎重論だ。', 1),
  ('lib-shinkanzen-n2-dokkai-2', 'lib-shinkanzen-n2-dokkai', '要するに', 'ようするに', 'Tóm lại, nói tóm gọn là', '要するに、結論はまだ出ていないということだ。', 2),
  ('lib-shinkanzen-n2-dokkai-3', 'lib-shinkanzen-n2-dokkai', '従って', 'したがって', 'Do đó, vì vậy (quan hệ nhân quả logic)', '需要が増えた。従って価格も上がった。', 3),
  ('lib-shinkanzen-n2-dokkai-4', 'lib-shinkanzen-n2-dokkai', '一方では', 'いっぽうでは', 'Mặt khác, đồng thời cũng', '利便性が高まる一方では、プライバシーの懸念もある。', 4),
  ('lib-shinkanzen-n2-dokkai-5', 'lib-shinkanzen-n2-dokkai', 'いわば', 'いわば', 'Ví như, có thể nói là', 'スマートフォンの普及は、いわば情報革命の象徴だ。', 5),
  ('lib-shinkanzen-n2-dokkai-6', 'lib-shinkanzen-n2-dokkai', 'あるいは', 'あるいは', 'Hoặc là, hoặc giả', '直接話すか、あるいはメールで連絡してください。', 6),
  ('lib-it-brse-words-1', 'lib-it-brse-words', '要件定義', 'ようけんていぎ', 'Định nghĩa yêu cầu (Requirements Definition)', 'お客様と要件定義の詰めを行っています。', 1),
  ('lib-it-brse-words-2', 'lib-it-brse-words', '設計書', 'せっけいしょ', 'Tài liệu thiết kế (Design document)', '基本設計書に沿って実装を進めてください。', 2),
  ('lib-it-brse-words-3', 'lib-it-brse-words', '不具合', 'ふぐあい', 'Lỗi, sự cố phần mềm (Bug / Defect)', 'テスト環境で重大な不具合が検出されました。', 3),
  ('lib-it-brse-words-4', 'lib-it-brse-words', '納期', 'のうき', 'Thời hạn bàn giao (Deadline/Delivery date)', '納期を厳守するために残業を調整します。', 4),
  ('lib-it-brse-words-5', 'lib-it-brse-words', '仕様変更', 'しようへんこう', 'Thay đổi quy cách / đặc tả (Spec change)', 'クライアントからの仕様変更依頼を受領しました。', 5),
  ('lib-it-brse-words-6', 'lib-it-brse-words', '本番反映', 'ほんばんはんえい', 'Release lên môi trường Production', '今夜22時に本番反映を予定しております。', 6),
  ('lib-kanji-214-radicals-1', 'lib-kanji-214-radicals', '契', 'ケイ / ちぎ・る', 'Khế (khế ước, giao kèo)', '契約書に署名と捺印を行いました。', 1),
  ('lib-kanji-214-radicals-2', 'lib-kanji-214-radicals', '機', 'キ / はた', 'Cơ (cơ hội, thời cơ, máy móc)', '絶好の機会を逃さないように注意する。', 2),
  ('lib-kanji-214-radicals-3', 'lib-kanji-214-radicals', '厳', 'ゲン / きび・しい', 'Nghiêm (nghiêm khắc, nghiêm trang)', '規則を厳格に適用します。', 3),
  ('lib-kanji-214-radicals-4', 'lib-kanji-214-radicals', '態', 'タイ', 'Thái (thái độ, trạng thái)', '誠実な態度で顧客に接する。', 4),
  ('lib-kanji-214-radicals-5', 'lib-kanji-214-radicals', '推', 'スイ / お・す', 'Thôi (suy luận, tiến cử, suy đoán)', '過去のデータから需要を推測する。', 5),
  ('lib-kanji-214-radicals-6', 'lib-kanji-214-radicals', '拡', 'カク', 'Khuếch (mở rộng, khuếch đại)', '海外市場へ事業を拡大する方針だ。', 6),
  ('lib-soumatome-n3-goi-1', 'lib-soumatome-n3-goi', '売り切れる', 'うりきれる', 'Bán hết sạch (sold out)', '人気の商品は午前中で売り切れてしまった。', 1),
  ('lib-soumatome-n3-goi-2', 'lib-soumatome-n3-goi', '間に合う', 'まにあう', 'Kịp giờ, vừa vặn', '走ったら電車の発車時刻に間に合った。', 2),
  ('lib-soumatome-n3-goi-3', 'lib-soumatome-n3-goi', '遠慮する', 'えんりょする', 'Khách khí, ngần ngại, kiềm chế', 'どうぞ遠慮しないでたくさん召し上がってください。', 3),
  ('lib-soumatome-n3-goi-4', 'lib-soumatome-n3-goi', '手続き', 'てつづき', 'Thủ tục hành chính, giấy tờ', '市役所でビザの更新手続きを済ませた。', 4),
  ('lib-soumatome-n3-goi-5', 'lib-soumatome-n3-goi', '相談に乗る', 'そうだんにのる', 'Lắng nghe lời tâm sự / tư vấn', '先輩が親身になって相談に乗ってくれた。', 5),
  ('lib-nhk-easy-news-1', 'lib-nhk-easy-news', '物価高', 'ぶっかだか', 'Vật giá leo thang, lạm phát', '物価高に対応するため、政府が支援策を発表した。', 1),
  ('lib-nhk-easy-news-2', 'lib-nhk-easy-news', '猛暑日', 'もうしょび', 'Ngày nắng nóng đỉnh điểm (>35 độ C)', '今年の夏は猛暑日が連続して記録された。', 2),
  ('lib-nhk-easy-news-3', 'lib-nhk-easy-news', '少子化', 'しょうしか', 'Tỷ lệ sinh giảm, già hóa dân số', '少子化のスピードを緩める取り組みが急務だ。', 3),
  ('lib-nhk-easy-news-4', 'lib-nhk-easy-news', '再生可能エネルギー', 'さいせいかのうえねるぎー', 'Năng lượng tái tạo', '太陽光発電などの再生可能エネルギーの導入が進む。', 4),
  ('lib-business-keigo-n1-1', 'lib-business-keigo-n1', 'ご高覧', 'ごこうらん', 'Xem, thưởng lãm (tôn kính ngữ của 見る)', '添付の企画書をご高覧いただけますと幸甚に存じます。', 1),
  ('lib-business-keigo-n1-2', 'lib-business-keigo-n1', 'ご査収', 'ごさしゅう', 'Kiểm tra và tiếp nhận (thường dùng khi đính kèm file)', '最新の見積書をお送りしますので、ご査収のほどお願いいたします。', 2),
  ('lib-business-keigo-n1-3', 'lib-business-keigo-n1', '存じ上げる', 'ぞんじあげる', 'Biết, nghĩ (khiêm nhường ngữ của 知っている / 思う)', '田中様のお名前は以前より存じ上げておりました。', 3),
  ('lib-business-keigo-n1-4', 'lib-business-keigo-n1', 'お取り計らい', 'おとりはからい', 'Sự sắp xếp, chiếu cố chu đáo từ đối tác', '温かいお取り計らいに心より感謝申し上げます。', 4),
  ('lib-business-keigo-n1-5', 'lib-business-keigo-n1', '恐縮', 'きょうしゅく', 'Vô cùng áy náy và cảm kích', 'お忙しいところ大変恐縮ですが、ご返信をお待ちしております。', 5),
  ('lib-minna-n5-core-1', 'lib-minna-n5-core', '初めまして', 'はじめまして', 'Rất vui được gặp bạn lần đầu', '初めまして、ナムと申します。ベトナムから来ました。', 1),
  ('lib-minna-n5-core-2', 'lib-minna-n5-core', 'よろしくお願いします', 'よろしくおねがいします', 'Rất mong nhận được sự giúp đỡ', 'こちらこそ、どうぞよろしくお願いします。', 2),
  ('lib-minna-n5-core-3', 'lib-minna-n5-core', 'どこ', 'どこ', 'Ở đâu (từ để hỏi nơi chốn)', 'お手洗いはどこですか。', 3),
  ('lib-minna-n5-core-4', 'lib-minna-n5-core', 'いくら', 'いくら', 'Bao nhiêu tiền', 'このリンゴはいくらですか。', 4),
  ('lib-minna-n5-core-5', 'lib-minna-n5-core', 'いっしょに', 'いっしょに', 'Cùng nhau', 'いっしょに昼ご飯を食べませんか。', 5)
) AS v(id, deck_id, term, reading, meaning, example, position)
ON CONFLICT (id) DO NOTHING;
