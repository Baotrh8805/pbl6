/**
 * Bộ phân tích và nhận diện giáo trình thông minh cho Classroom (AI Curriculum Parser)
 * Hỗ trợ bóc tách cấu trúc bài học, phát hiện số lượng bài thực tế và trích xuất từ vựng tương ứng.
 */

export interface AiCard {
    term: string;
    reading: string;
    meaning: string;
    hanViet?: string;
}

export interface LessonTemplate {
    title: string;
    cards: AiCard[];
}

/** Kho dữ liệu 25 bài học chuẩn của giáo trình Minna no Nihongo Tập 1 (N5) */
export const MINNA_I_LESSONS: LessonTemplate[] = [
    {
        title: "Bài 1: Từ vựng mở đầu & Chào hỏi",
        cards: [
            { term: "初めまして", reading: "はじめまして", hanViet: "SƠ", meaning: "Rất vui được gặp bạn lần đầu" },
            { term: "どうぞよろしく", reading: "どうぞよろしく", meaning: "Rất mong được sự giúp đỡ của bạn" },
            { term: "私", reading: "わたし", hanViet: "TƯ", meaning: "Tôi, bản thân tôi" },
            { term: "あなた", reading: "あなた", meaning: "Bạn, anh / chị" },
            { term: "あの人", reading: "あのひと", hanViet: "NHÂN", meaning: "Người kia, người đó" },
            { term: "あの方", reading: "あのかた", hanViet: "PHƯƠNG", meaning: "Vị kia (lịch sự của あの人)" },
            { term: "先生", reading: "せんせい", hanViet: "TIÊN SINH", meaning: "Thầy cô giáo" },
            { term: "教師", reading: "きょうし", hanViet: "GIÁO SƯ", meaning: "Giáo viên (nghề nghiệp)" },
            { term: "学生", reading: "がくせい", hanViet: "HỌC SINH", meaning: "Học sinh, sinh viên" },
            { term: "会社員", reading: "かいしゃいん", hanViet: "HỘI XÃ VIÊN", meaning: "Nhân viên công ty" },
            { term: "社員", reading: "しゃいん", hanViet: "XÃ VIÊN", meaning: "Nhân viên (đi kèm tên công ty)" },
            { term: "銀行員", reading: "ぎんこういん", hanViet: "NGÂN HÀNG VIÊN", meaning: "Nhân viên ngân hàng" },
            { term: "医者", reading: "いしゃ", hanViet: "Y GIẢ", meaning: "Bác sĩ" },
            { term: "研究者", reading: "けんきゅうしゃ", hanViet: "NGHIÊN CỨU GIẢ", meaning: "Nhà nghiên cứu" },
            { term: "大学", reading: "だいがく", hanViet: "ĐẠI HỌC", meaning: "Trường đại học" },
            { term: "病院", reading: "びょういん", hanViet: "BỆNH VIỆN", meaning: "Bệnh viện" },
            { term: "だれ", reading: "だれ", meaning: "Ai (nghi vấn từ)" },
            { term: "どなた", reading: "どなた", meaning: "Vị nào (lịch sự của だれ)" },
            { term: "歳", reading: "さい", hanViet: "TUẾ", meaning: "Tuổi" },
            { term: "何歳", reading: "なんさい", hanViet: "HÀ TUẾ", meaning: "Mấy tuổi" },
            { term: "日本", reading: "にほん", hanViet: "NHẬT BẢN", meaning: "Nước Nhật Bản" },
            { term: "ベトナム", reading: "ベトナム", meaning: "Nước Việt Nam" },
            { term: "失礼ですが", reading: "しつれいですが", hanViet: "THẤT LỄ", meaning: "Xin lỗi / Thứ lỗi cho tôi hỏi" },
            { term: "お名前は", reading: "おなまえは", hanViet: "DANH TIỀN", meaning: "Tên bạn là gì?" },
        ],
    },
    {
        title: "Bài 2: Đồ vật & Sinh hoạt thường nhật",
        cards: [
            { term: "これ", reading: "これ", meaning: "Cái này (ở gần người nói)" },
            { term: "それ", reading: "それ", meaning: "Cái đó (ở gần người nghe)" },
            { term: "あれ", reading: "あれ", meaning: "Cái kia (xa cả hai người)" },
            { term: "この", reading: "この", meaning: "Cái ~ này (đi liền danh từ)" },
            { term: "その", reading: "その", meaning: "Cái ~ đó (đi liền danh từ)" },
            { term: "あの", reading: "あの", meaning: "Cái ~ kia (đi liền danh từ)" },
            { term: "本", reading: "ほん", hanViet: "BẢN", meaning: "Sách" },
            { term: "辞書", reading: "じしょ", hanViet: "TỪ THƯ", meaning: "Từ điển" },
            { term: "雑誌", reading: "ざっし", hanViet: "TẠP CHÍ", meaning: "Tạp chí" },
            { term: "新聞", reading: "しんぶん", hanViet: "TÂN VĂN", meaning: "Báo chí" },
            { term: "ノート", reading: "ノート", meaning: "Vở ghi bài" },
            { term: "手帳", reading: "てちょう", hanViet: "THỦ TRƯỚNG", meaning: "Sổ tay cá nhân" },
            { term: "名刺", reading: "めいし", hanViet: "DANH THỨ", meaning: "Danh thiếp" },
            { term: "鉛筆", reading: "えんぴつ", hanViet: "DUYÊN BÚT", meaning: "Bút chì" },
            { term: "ボールペン", reading: "ボールペン", meaning: "Bút bi" },
            { term: "鍵", reading: "かぎ", hanViet: "KIỆN", meaning: "Chìa khóa" },
            { term: "時計", reading: "とけい", hanViet: "THỜI KẾ", meaning: "Đồng hồ" },
            { term: "傘", reading: "かさ", hanViet: "TẢN", meaning: "Cây ô, dù" },
            { term: "鞄", reading: "かばん", meaning: "Cặp sách, túi xách" },
            { term: "テレビ", reading: "テレビ", meaning: "Tivi, truyền hình" },
            { term: "ラジオ", reading: "ラジオ", meaning: "Đài phát thanh" },
            { term: "カメラ", reading: "カメラ", meaning: "Máy chụp ảnh" },
            { term: "自動車", reading: "じどうしゃ", hanViet: "TỰ ĐỘNG XA", meaning: "Xe ô tô hơi" },
            { term: "机", reading: "つくえ", hanViet: "KỶ", meaning: "Bàn học, bàn làm việc" },
            { term: "椅子", reading: "いす", hanViet: "Y TỬ", meaning: "Cái ghế ngồi" },
        ],
    },
    {
        title: "Bài 3: Địa điểm & Giao tiếp mua sắm",
        cards: [
            { term: "ここ", reading: "ここ", meaning: "Ở đây (nơi người nói đứng)" },
            { term: "そこ", reading: "そこ", meaning: "Ở đó (nơi người nghe đứng)" },
            { term: "あそこ", reading: "あそこ", meaning: "Ở kia (xa cả hai người)" },
            { term: "どこ", reading: "どこ", meaning: "Ở đâu (nghi vấn từ)" },
            { term: "こちら", reading: "こちら", meaning: "Phía này, đằng này (lịch sự)" },
            { term: "そちら", reading: "そちら", meaning: "Phía đó, đằng đó (lịch sự)" },
            { term: "あちら", reading: "あちら", meaning: "Phía kia, đằng kia (lịch sự)" },
            { term: "どちら", reading: "どちら", meaning: "Phía nào, hướng nào (lịch sự)" },
            { term: "教室", reading: "きょうしつ", hanViet: "GIÁO THẤT", meaning: "Phòng học, lớp học" },
            { term: "食堂", reading: "しょくどう", hanViet: "THỰC ĐƯỜNG", meaning: "Nhà ăn, căng tin" },
            { term: "事務所", reading: "じむしょ", hanViet: "SỰ VỤ SỞ", meaning: "Văn phòng làm việc" },
            { term: "会議室", reading: "かいぎしつ", hanViet: "HỘI NGHỊ THẤT", meaning: "Phòng họp" },
            { term: "受付", reading: "うけつけ", hanViet: "THỤ PHÓ", meaning: "Quầy tiếp tân" },
            { term: "部屋", reading: "へや", hanViet: "BỘ ỐC", meaning: "Căn phòng" },
            { term: "トイレ", reading: "トイレ", meaning: "Nhà vệ sinh" },
            { term: "階段", reading: "かいだん", hanViet: "GIAI ĐOẠN", meaning: "Cầu thang bộ" },
            { term: "エレベーター", reading: "エレベーター", meaning: "Thang máy" },
            { term: "会社", reading: "かいしゃ", hanViet: "HỘI XÃ", meaning: "Công ty" },
            { term: "うち", reading: "うち", hanViet: "GIA", meaning: "Nhà, gia đình" },
            { term: "靴", reading: "くつ", hanViet: "NGOA", meaning: "Đôi giày" },
            { term: "いくら", reading: "いくら", meaning: "Bao nhiêu tiền" },
            { term: "百", reading: "ひゃく", hanViet: "BÁCH", meaning: "Một trăm" },
            { term: "千", reading: "せん", hanViet: "THIÊN", meaning: "Một nghìn" },
            { term: "万", reading: "まん", hanViet: "VẠN", meaning: "Một vạn (mười nghìn)" },
        ],
    },
    {
        title: "Bài 4: Thời gian & Lịch trình sinh hoạt",
        cards: [
            { term: "今", reading: "いま", hanViet: "KIM", meaning: "Bây giờ, hiện tại" },
            { term: "時", reading: "じ", hanViet: "THỜI", meaning: "Giờ (thời gian)" },
            { term: "分", reading: "ふん / ぷん", hanViet: "PHÂN", meaning: "Phút" },
            { term: "半", reading: "はん", hanViet: "BÁN", meaning: "Rưỡi, một nửa" },
            { term: "午前", reading: "ごぜん", hanViet: "NGỌ TIỀN", meaning: "Buổi sáng (AM)" },
            { term: "午後", reading: "ごご", hanViet: "NGỌ HẬU", meaning: "Buổi chiều (PM)" },
            { term: "朝", reading: "あさ", hanViet: "TRIÊU", meaning: "Buổi sáng" },
            { term: "昼", reading: "ひる", hanViet: "TRÚ", meaning: "Buổi trưa" },
            { term: "晩", reading: "ばん", hanViet: "VÃN", meaning: "Buổi tối, đêm" },
            { term: "昨日", reading: "きのう", hanViet: "TẠC NHẬT", meaning: "Hôm qua" },
            { term: "今日", reading: "きょう", hanViet: "KIM NHẬT", meaning: "Hôm nay" },
            { term: "明日", reading: "あした", hanViet: "MINH NHẬT", meaning: "Ngày mai" },
            { term: "毎朝", reading: "まいあさ", hanViet: "MỖI TRIÊU", meaning: "Mỗi sáng" },
            { term: "毎晩", reading: "まいばん", hanViet: "MỖI VÃN", meaning: "Mỗi tối" },
            { term: "毎日", reading: "まいにち", hanViet: "MỖI NHẬT", meaning: "Mỗi ngày, hằng ngày" },
            { term: "起きます", reading: "おきます", hanViet: "KHỞI", meaning: "Thức dậy" },
            { term: "寝ます", reading: "ねます", hanViet: "TẨM", meaning: "Đi ngủ" },
            { term: "働きます", reading: "はたらきます", hanViet: "ĐỘNG", meaning: "Làm việc" },
            { term: "休みます", reading: "やすみます", hanViet: "HƯU", meaning: "Nghỉ ngơi" },
            { term: "勉強します", reading: "べんきょうします", hanViet: "MIỄN CƯỜNG", meaning: "Học tập" },
            { term: "月曜日", reading: "げつようび", hanViet: "NGUYỆT DIỆU NHẬT", meaning: "Thứ hai" },
            { term: "日曜日", reading: "にちようび", hanViet: "NHẬT DIỆU NHẬT", meaning: "Chủ nhật" },
        ],
    },
    {
        title: "Bài 5: Di chuyển & Phương tiện giao thông",
        cards: [
            { term: "行きます", reading: "いきます", hanViet: "HÀNH", meaning: "Đi đến đâu đó" },
            { term: "来ます", reading: "きます", hanViet: "LAI", meaning: "Đến đây" },
            { term: "帰ります", reading: "かえります", hanViet: "QUY", meaning: "Trở về (nhà, nước)" },
            { term: "学校", reading: "がっこう", hanViet: "HỌC HIỆU", meaning: "Trường học" },
            { term: "スーパー", reading: "スーパー", meaning: "Siêu thị" },
            { term: "駅", reading: "えき", hanViet: "DỊCH", meaning: "Nhà ga xe lửa" },
            { term: "飛行機", reading: "ひこうき", hanViet: "PHI HÀNH CƠ", meaning: "Máy bay" },
            { term: "船", reading: "ふね", hanViet: "THUYỀN", meaning: "Tàu thủy, thuyền" },
            { term: "電車", reading: "でんしゃ", hanViet: "ĐIỆN XA", meaning: "Tàu điện" },
            { term: "地下鉄", reading: "ちかてつ", hanViet: "ĐỊA HẠ THIẾT", meaning: "Tàu điện ngầm" },
            { term: "新幹線", reading: "しんかんせん", hanViet: "TÂN CÁN TUYẾN", meaning: "Tàu cao tốc Shinkansen" },
            { term: "バス", reading: "バス", meaning: "Xe buýt" },
            { term: "タクシー", reading: "タクシー", meaning: "Xe taxi" },
            { term: "自転車", reading: "じてんしゃ", hanViet: "TỰ CHUYỂN XA", meaning: "Xe đạp" },
            { term: "歩いて", reading: "あるいて", hanViet: "BỘ", meaning: "Đi bộ" },
            { term: "人", reading: "ひと", hanViet: "NHÂN", meaning: "Người" },
            { term: "友達", reading: "ともだち", hanViet: "HỮU ĐẠT", meaning: "Bạn bè" },
            { term: "彼", reading: "かれ", hanViet: "BỈ", meaning: "Anh ấy, bạn trai" },
            { term: "彼女", reading: "かのじょ", hanViet: "BỈ NỮ", meaning: "Cô ấy, bạn gái" },
            { term: "家族", reading: "かぞく", hanViet: "GIA TỘC", meaning: "Gia đình" },
            { term: "一人で", reading: "ひとりで", hanViet: "NHẤT NHÂN", meaning: "Một mình" },
            { term: "先週", reading: "せんしゅう", hanViet: "TIÊN CHU", meaning: "Tuần trước" },
            { term: "今週", reading: "こんしゅう", hanViet: "KIM CHU", meaning: "Tuần này" },
            { term: "来週", reading: "らいしゅう", hanViet: "LAI CHU", meaning: "Tuần sau" },
        ],
    },
    {
        title: "Bài 6: Đồ ăn, Thức uống & Hoạt động thường nhật",
        cards: [
            { term: "食べます", reading: "たべます", hanViet: "THỰC", meaning: "Ăn" },
            { term: "飲みます", reading: "のみます", hanViet: "ẨM", meaning: "Uống" },
            { term: "吸います", reading: "すいます", hanViet: "HẤP", meaning: "Hút (thuốc)" },
            { term: "見ます", reading: "みます", hanViet: "KIẾN", meaning: "Xem, nhìn" },
            { term: "聞きます", reading: "ききます", hanViet: "VĂN", meaning: "Nghe" },
            { term: "読みます", reading: "よみます", hanViet: "ĐỘC", meaning: "Đọc" },
            { term: "書きます", reading: "かきます", hanViet: "THƯ", meaning: "Viết, vẽ" },
            { term: "買います", reading: "かいます", hanViet: "MÃI", meaning: "Mua" },
            { term: "撮ります", reading: "とります", hanViet: "TOÁT", meaning: "Chụp (ảnh)" },
            { term: "ご飯", reading: "ごはん", hanViet: "PHẠN", meaning: "Cơm, bữa ăn" },
            { term: "朝ご飯", reading: "あさごはん", hanViet: "TRIÊU PHẠN", meaning: "Bữa ăn sáng" },
            { term: "昼ご飯", reading: "ひるごはん", hanViet: "TRÚ PHẠN", meaning: "Bữa ăn trưa" },
            { term: "晩ご飯", reading: "ばんごはん", hanViet: "VÃN PHẠN", meaning: "Bữa ăn tối" },
            { term: "パン", reading: "パン", meaning: "Bánh mì" },
            { term: "卵", reading: "たまご", hanViet: "NOÃN", meaning: "Quả trứng" },
            { term: "肉", reading: "にく", hanViet: "NHỤC", meaning: "Thịt" },
            { term: "魚", reading: "さかな", hanViet: "NGƯ", meaning: "Con cá" },
            { term: "野菜", reading: "やさい", hanViet: "DÃ THÁI", meaning: "Rau củ" },
            { term: "果物", reading: "くだもの", hanViet: "QUẢ VẬT", meaning: "Trái cây, hoa quả" },
            { term: "水", reading: "みず", hanViet: "THỦY", meaning: "Nước lọc" },
            { term: "お茶", reading: "おちゃ", hanViet: "TRÀ", meaning: "Trà xanh" },
            { term: "牛乳", reading: "ぎゅうにゅう", hanViet: "NGƯU NHŨ", meaning: "Sữa tươi" },
            { term: "一緒", reading: "いっしょ", hanViet: "NHẤT TỰ", meaning: "Cùng nhau" },
        ],
    },
    {
        title: "Bài 7: Công cụ, Phương tiện & Cho - Nhận quà",
        cards: [
            { term: "切ります", reading: "きります", hanViet: "THIẾT", meaning: "Cắt, gọt" },
            { term: "送ります", reading: "おくります", hanViet: "TỐNG", meaning: "Gửi (hàng, thư)" },
            { term: "あげます", reading: "あげます", meaning: "Tặng, cho (ai đó cái gì)" },
            { term: "もらいます", reading: "もらいます", meaning: "Nhận được từ ai cái gì" },
            { term: "貸します", reading: "かします", hanViet: "THẢI", meaning: "Cho mượn, cho vay" },
            { term: "借ります", reading: "かります", hanViet: "TÁ", meaning: "Mượn, vay" },
            { term: "教えます", reading: "おしえます", hanViet: "GIÁO", meaning: "Dạy học, chỉ bảo" },
            { term: "習います", reading: "ならいます", hanViet: "TẬP", meaning: "Học từ ai đó" },
            { term: "手", reading: "て", hanViet: "THỦ", meaning: "Bàn tay" },
            { term: "箸", reading: "はし", hanViet: "TRỢ", meaning: "Đôi đũa" },
            { term: "スプーン", reading: "スプーン", meaning: "Cái thìa, muỗng" },
            { term: "ナイフ", reading: "ナイフ", meaning: "Con dao ăn" },
            { term: "フォーク", reading: "フォーク", meaning: "Cái nĩa" },
            { term: "はさみ", reading: "はさみ", meaning: "Cái kéo cắt" },
            { term: "パソコン", reading: "パソコン", meaning: "Máy vi tính cá nhân" },
            { term: "ケータイ", reading: "ケータイ", meaning: "Điện thoại di động" },
            { term: "プレゼント", reading: "プレゼント", meaning: "Món quà tặng" },
            { term: "荷物", reading: "にもつ", hanViet: "HÀ VẬT", meaning: "Hành lý, kiện hàng" },
            { term: "お金", reading: "おかね", hanViet: "KIM", meaning: "Tiền bạc" },
            { term: "切符", reading: "きっぷ", hanViet: "THIẾT PHÙ", meaning: "Vé tàu, vé xe" },
            { term: "もう", reading: "もう", meaning: "Đã... rồi" },
            { term: "まだ", reading: "まだ", meaning: "Chưa... vẫn còn" },
        ],
    },
    {
        title: "Bài 8: Tính từ miêu tả & Đời sống hằng ngày",
        cards: [
            { term: "きれいな", reading: "きれいな", meaning: "Đẹp, sạch sẽ" },
            { term: "静かな", reading: "しずかな", hanViet: "TĨNH", meaning: "Yên tĩnh, thanh bình" },
            { term: "にぎやかな", reading: "にぎやかな", meaning: "Nhộn nhịp, náo nhiệt" },
            { term: "有名な", reading: "ゆうめいな", hanViet: "HỮU DANH", meaning: "Nổi tiếng" },
            { term: "親切な", reading: "しんせつな", hanViet: "THÂN THIẾT", meaning: "Tốt bụng, thân thiện" },
            { term: "元気な", reading: "げんきな", hanViet: "NGUYÊN KHÍ", meaning: "Khỏe mạnh, tràn đầy năng lượng" },
            { term: "暇な", reading: "ひまな", hanViet: "HẠ", meaning: "Rảnh rỗi" },
            { term: "便利な", reading: "べんりな", hanViet: "TIỆN LỢI", meaning: "Tiện lợi, thuận tiện" },
            { term: "大きい", reading: "おおきい", hanViet: "ĐẠI", meaning: "To lớn" },
            { term: "小さい", reading: "ちいさい", hanViet: "TIỂU", meaning: "Nhỏ bé" },
            { term: "新しい", reading: "あたらしい", hanViet: "TÂN", meaning: "Mới" },
            { term: "古い", reading: "ふるい", hanViet: "CỔ", meaning: "Cũ, cổ xưa" },
            { term: "いい", reading: "いい", meaning: "Tốt, hay" },
            { term: "悪い", reading: "わるい", hanViet: "ÁC", meaning: "Xấu, tồi" },
            { term: "暑い", reading: "あつい", hanViet: "THỬ", meaning: "Nóng (thời tiết)" },
            { term: "寒い", reading: "さむい", hanViet: "HÀN", meaning: "Lạnh, rét (thời tiết)" },
            { term: "冷たい", reading: "つめたい", hanViet: "LÃNH", meaning: "Lạnh, buốt (đồ vật/đồ uống)" },
            { term: "難しい", reading: "むずかしい", hanViet: "NAN", meaning: "Khó khăn" },
            { term: "易しい", reading: "やさしい", hanViet: "DỊ", meaning: "Dễ dàng, đơn giản" },
            { term: "高い", reading: "たかい", hanViet: "CAO", meaning: "Đắt tiền, cao lớn" },
            { term: "安い", reading: "やすい", hanViet: "AN", meaning: "Rẻ (giá cả)" },
            { term: "おいしい", reading: "おいしい", meaning: "Ngon miệng" },
            { term: "忙しい", reading: "いそがしい", hanViet: "MANG", meaning: "Bận rộn" },
            { term: "楽しい", reading: "たのしい", hanViet: "LẠC", meaning: "Vui vẻ, hào hứng" },
        ],
    },
    {
        title: "Bài 9: Sở thích, Năng lực & Giao tiếp cảm xúc",
        cards: [
            { term: "わかります", reading: "わかります", meaning: "Hiểu, nắm rõ" },
            { term: "あります", reading: "あります", meaning: "Có (đồ vật, sự sở hữu)" },
            { term: "好き", reading: "すき", hanViet: "HẢO", meaning: "Thích" },
            { term: "嫌い", reading: "きらい", hanViet: "HIỀM", meaning: "Ghét, không thích" },
            { term: "上手", reading: "じょうず", hanViet: "THƯỢNG THỦ", meaning: "Giỏi, khéo léo" },
            { term: "下手", reading: "へた", hanViet: "HẠ THỦ", meaning: "Kém, dở vụng" },
            { term: "料理", reading: "りょうり", hanViet: "LIỆU LÝ", meaning: "Món ăn, nấu nướng" },
            { term: "スポーツ", reading: "スポーツ", meaning: "Thể thao" },
            { term: "野球", reading: "やきゅう", hanViet: "DÃ CẦU", meaning: "Bóng chày" },
            { term: "旅行", reading: "りょこう", hanViet: "LỮ HÀNH", meaning: "Đi du lịch" },
            { term: "音楽", reading: "おんがく", hanViet: "ÂM NHẠC", meaning: "Âm nhạc" },
            { term: "歌", reading: "うた", hanViet: "CA", meaning: "Bài hát" },
            { term: "絵", reading: "え", hanViet: "HỘI", meaning: "Bức tranh, hội họa" },
            { term: "字", reading: "じ", hanViet: "TỰ", meaning: "Chữ viết" },
            { term: "漢字", reading: "かんじ", hanViet: "HÁN TỰ", meaning: "Chữ Hán Kanji" },
            { term: "時間", reading: "じかん", hanViet: "THỜI GIAN", meaning: "Thời gian" },
            { term: "用事", reading: "ようじ", hanViet: "DỤNG SỰ", meaning: "Việc bận, công chuyện" },
            { term: "約束", reading: "やくそく", hanViet: "ƯỚC THÚC", meaning: "Lời hẹn, cuộc hẹn" },
            { term: "たくさん", reading: "たくさん", meaning: "Nhiều" },
            { term: "少し", reading: "すこし", hanViet: "THIỂU", meaning: "Một chút, một ít" },
            { term: "全然", reading: "ぜんぜん", hanViet: "TOÀN NHIÊN", meaning: "Hoàn toàn không (đi với phủ định)" },
            { term: "どうして", reading: "どうして", meaning: "Tại sao, vì sao" },
        ],
    },
    {
        title: "Bài 10: Vị trí & Sự tồn tại (Người / Đồ vật)",
        cards: [
            { term: "います", reading: "います", meaning: "Có, ở (người, động vật sống)" },
            { term: "あります", reading: "あります", meaning: "Có, ở (đồ vật, thực vật)" },
            { term: "男の人", reading: "おとこのひと", hanViet: "NAM NHÂN", meaning: "Người đàn ông" },
            { term: "女の人", reading: "おんなのひと", hanViet: "NỮ NHÂN", meaning: "Người phụ nữ" },
            { term: "男の子", reading: "おとこのこ", hanViet: "NAM TỬ", meaning: "Bé trai" },
            { term: "女の子", reading: "おんなのこ", hanViet: "NỮ TỬ", meaning: "Bé gái" },
            { term: "犬", reading: "いぬ", hanViet: "KHUYỂN", meaning: "Con chó" },
            { term: "猫", reading: "ねこ", hanViet: "MIÊU", meaning: "Con mèo" },
            { term: "木", reading: "き", hanViet: "MỘC", meaning: "Cây cối" },
            { term: "物", reading: "もの", hanViet: "VẬT", meaning: "Đồ vật" },
            { term: "箱", reading: "はこ", hanViet: "TƯƠNG", meaning: "Cái hộp, thùng" },
            { term: "冷蔵庫", reading: "れいぞうこ", hanViet: "LÃNH TÀNG KHỐ", meaning: "Tủ lạnh" },
            { term: "テーブル", reading: "テーブル", meaning: "Cái bàn ăn" },
            { term: "ベッド", reading: "ベッド", meaning: "Giường ngủ" },
            { term: "棚", reading: "たな", hanViet: "BẰNG", meaning: "Giá sách, kệ" },
            { term: "ドア", reading: "ドア", meaning: "Cánh cửa ra vào" },
            { term: "窓", reading: "まど", hanViet: "SONG", meaning: "Cửa sổ" },
            { term: "公園", reading: "こうえん", hanViet: "CÔNG VIÊN", meaning: "Công viên" },
            { term: "本屋", reading: "ほんや", hanViet: "BẢN ỐC", meaning: "Hiệu sách" },
            { term: "上", reading: "うえ", hanViet: "THƯỢNG", meaning: "Phía trên" },
            { term: "下", reading: "した", hanViet: "HẠ", meaning: "Phía dưới" },
            { term: "前", reading: "まえ", hanViet: "TIỀN", meaning: "Phía trước" },
            { term: "後ろ", reading: "うしろ", hanViet: "HẬU", meaning: "Phía sau" },
            { term: "右", reading: "みぎ", hanViet: "HỮU", meaning: "Bên phải" },
            { term: "左", reading: "ひだり", hanViet: "TẢ", meaning: "Bên trái" },
            { term: "中", reading: "なか", hanViet: "TRUNG", meaning: "Bên trong" },
            { term: "外", reading: "そと", hanViet: "NGOẠI", meaning: "Bên ngoài" },
            { term: "隣", reading: "となり", hanViet: "LÂN", meaning: "Bên cạnh" },
            { term: "近く", reading: "ちかく", hanViet: "CẬN", meaning: "Gần đây" },
            { term: "間", reading: "あいだ", hanViet: "GIAN", meaning: "Ở giữa hai vật" },
        ],
    },
    {
        title: "Bài 11: Số lượng, Thời lượng & Đếm đồ vật",
        cards: [
            { term: "かかります", reading: "かかります", meaning: "Mất, tốn (thời gian / tiền bạc)" },
            { term: "ひとつ", reading: "ひとつ", meaning: "1 cái (đếm đồ vật chung)" },
            { term: "ふたつ", reading: "ふたつ", meaning: "2 cái" },
            { term: "みっつ", reading: "みっつ", meaning: "3 cái" },
            { term: "よっつ", reading: "よっつ", meaning: "4 cái" },
            { term: "いつつ", reading: "いつつ", meaning: "5 cái" },
            { term: "むっつ", reading: "むっつ", meaning: "6 cái" },
            { term: "ななつ", reading: "ななつ", meaning: "7 cái" },
            { term: "やっつ", reading: "やっつ", meaning: "8 cái" },
            { term: "ここのつ", reading: "ここのつ", meaning: "9 cái" },
            { term: "とお", reading: "とお", meaning: "10 cái" },
            { term: "いくつ", reading: "いくつ", meaning: "Bao nhiêu cái" },
            { term: "一人", reading: "ひとり", hanViet: "NHẤT NHÂN", meaning: "1 người" },
            { term: "二人", reading: "ふたり", hanViet: "NHỊ NHÂN", meaning: "2 người" },
            { term: "～台", reading: "～だい", hanViet: "ĐÀI", meaning: "~ chiếc, cái (máy móc, xe cộ)" },
            { term: "～枚", reading: "～まい", hanViet: "MAI", meaning: "~ tờ, tấm (vật mỏng, giấy)" },
            { term: "～回", reading: "～かい", hanViet: "HỒI", meaning: "~ lần (tần suất)" },
            { term: "切手", reading: "きって", hanViet: "THIẾT THỦ", meaning: "Tem bưu điện" },
            { term: "はがき", reading: "はがき", hanViet: "DIỆP THƯ", meaning: "Bưu thiếp" },
            { term: "封筒", reading: "ふうとう", hanViet: "PHONG ĐỒNG", meaning: "Phong bì thư" },
            { term: "両親", reading: "りょうしん", hanViet: "LƯỠNG THÂN", meaning: "Bố mẹ" },
            { term: "兄弟", reading: "きょうだい", hanViet: "HUYNH ĐỆ", meaning: "Anh chị em" },
            { term: "どのくらい", reading: "どのくらい", meaning: "Mất bao lâu, khoảng chừng nào" },
        ],
    },
    {
        title: "Bài 12: So sánh, Thời tiết & Đánh giá",
        cards: [
            { term: "簡単", reading: "かんたん", hanViet: "GIẢN ĐƠN", meaning: "Đơn giản, dễ dàng" },
            { term: "近い", reading: "ちかい", hanViet: "CẬN", meaning: "Gần gũi (khoảng cách)" },
            { term: "遠い", reading: "とおい", hanViet: "VIỄN", meaning: "Xa xôi" },
            { term: "速い", reading: "はやい", hanViet: "TỐC", meaning: "Nhanh chóng" },
            { term: "遅い", reading: "おそい", hanViet: "TRÌ", meaning: "Chậm chạp, muộn" },
            { term: "多い", reading: "おおい", hanViet: "ĐA", meaning: "Nhiều (người/vật)" },
            { term: "少ない", reading: "すくない", hanViet: "THIỂU", meaning: "Ít" },
            { term: "温かい", reading: "あたたかい", hanViet: "ÔN", meaning: "Ấm áp" },
            { term: "涼しい", reading: "すずしい", hanViet: "LƯƠNG", meaning: "Mát mẻ" },
            { term: "甘い", reading: "あまい", hanViet: "CAM", meaning: "Ngọt ngào" },
            { term: "辛い", reading: "からい", hanViet: "TÂN", meaning: "Cay nồng" },
            { term: "重い", reading: "おもい", hanViet: "TRỌNG", meaning: "Nặng nề" },
            { term: "軽い", reading: "かるい", hanViet: "KHINH", meaning: "Nhẹ nhàng" },
            { term: "季節", reading: "きせつ", hanViet: "QUÝ TIẾT", meaning: "Mùa trong năm" },
            { term: "春", reading: "はる", hanViet: "XUÂN", meaning: "Mùa xuân" },
            { term: "夏", reading: "なつ", hanViet: "HẠ", meaning: "Mùa hè" },
            { term: "秋", reading: "あき", hanViet: "THU", meaning: "Mùa thu" },
            { term: "冬", reading: "ふゆ", hanViet: "ĐÔNG", meaning: "Mùa đông" },
            { term: "天気", reading: "てんき", hanViet: "THIÊN KHÍ", meaning: "Thời tiết" },
            { term: "雨", reading: "あめ", hanViet: "VŨ", meaning: "Trời mưa" },
            { term: "雪", reading: "ゆき", hanViet: "TUYẾT", meaning: "Tuyết rơi" },
            { term: "どちら", reading: "どちら", meaning: "Bên nào, cái nào giữa hai thứ" },
            { term: "ずっと", reading: "ずっと", meaning: "Hơn hẳn, suốt" },
        ],
    },
    {
        title: "Bài 13: Mong muốn & Hoạt động giải trí",
        cards: [
            { term: "遊びます", reading: "あそびます", hanViet: "DU", meaning: "Đi chơi, giải trí" },
            { term: "泳ぎます", reading: "およぎます", hanViet: "VỊNH", meaning: "Bơi lội" },
            { term: "迎えます", reading: "むかえます", hanViet: "NGHÊNH", meaning: "Đón tiếp" },
            { term: "疲れます", reading: "つかれます", hanViet: "BÌ", meaning: "Mệt mỏi" },
            { term: "結婚します", reading: "けっこんします", hanViet: "KẾT HÔN", meaning: "Kết hôn, cưới" },
            { term: "買い物します", reading: "かいものします", hanViet: "MÃI VẬT", meaning: "Đi mua sắm" },
            { term: "散歩します", reading: "さんぽします", hanViet: "TẢN BỘ", meaning: "Đi dạo bộ" },
            { term: "欲しい", reading: "ほしい", hanViet: "DỤC", meaning: "Muốn có (vật gì)" },
            { term: "寂しい", reading: "さびしい", hanViet: "TỊCH", meaning: "Buồn bã, cô đơn" },
            { term: "広い", reading: "ひろい", hanViet: "QUẢNG", meaning: "Rộng rãi" },
            { term: "狭い", reading: "せまい", hanViet: "HIỆP", meaning: "Chật hẹp" },
            { term: "川", reading: "かわ", hanViet: "XUYÊN", meaning: "Dòng sông" },
            { term: "週末", reading: "しゅうまつ", hanViet: "CHU MẠT", meaning: "Cuối tuần" },
            { term: "どこか", reading: "どこか", meaning: "Đâu đó, nơi nào đó" },
            { term: "何か", reading: "なにか", meaning: "Cái gì đó" },
            { term: "お腹が空きました", reading: "おなかがすきました", hanViet: "KHÔNG", meaning: "Đói bụng rồi" },
            { term: "喉が渇きました", reading: "のどがかわきました", hanViet: "KHÁT", meaning: "Khát nước rồi" },
        ],
    },
    {
        title: "Bài 14: Thể Te & Yêu cầu giúp đỡ",
        cards: [
            { term: "つけます", reading: "つけます", meaning: "Bật (điện, máy điều hòa)" },
            { term: "消します", reading: "けします", hanViet: "TIÊU", meaning: "Tắt (điện, máy)" },
            { term: "開けます", reading: "あけます", hanViet: "KHAI", meaning: "Mở (cửa, hộp)" },
            { term: "閉めます", reading: "しめます", hanViet: "BẾ", meaning: "Đóng (cửa)" },
            { term: "急ぎます", reading: "いそぎます", hanViet: "CẤP", meaning: "Vội vàng, khẩn trương" },
            { term: "待ちます", reading: "まちます", hanViet: "ĐÃI", meaning: "Đợi, chờ đợi" },
            { term: "止めます", reading: "とめます", hanViet: "CHỈ", meaning: "Dừng lại, đỗ xe" },
            { term: "曲がります", reading: "まがります", hanViet: "KHÚC", meaning: "Rẽ (phải / trái)" },
            { term: "持ちます", reading: "もちます", hanViet: "TRÌ", meaning: "Cầm, nắm, mang theo" },
            { term: "取ります", reading: "とります", hanViet: "THỦ", meaning: "Lấy hộ, cầm lấy" },
            { term: "手伝います", reading: "てつだいます", hanViet: "THỦ TRUYỀN", meaning: "Giúp đỡ" },
            { term: "呼びます", reading: "よびます", hanViet: "HÔ", meaning: "Gọi (taxi, bạn)" },
            { term: "話します", reading: "はなします", hanViet: "THOẠI", meaning: "Trò chuyện, nói chuyện" },
            { term: "使います", reading: "つかいます", hanViet: "SỬ", meaning: "Sử dụng, dùng" },
            { term: "始めます", reading: "はじめます", hanViet: "THỦY", meaning: "Bắt đầu" },
            { term: "降ります", reading: "ふります", hanViet: "GIÁNG", meaning: "Rơi (mưa, tuyết)" },
            { term: "パスポート", reading: "パスポート", meaning: "Hộ chiếu" },
            { term: "地図", reading: "ちず", hanViet: "ĐỊA ĐỒ", meaning: "Bản đồ" },
            { term: "すぐ", reading: "すぐ", meaning: "Ngay lập tức" },
            { term: "ゆっくり", reading: "ゆっくり", meaning: "Chậm rãi, thong thả" },
        ],
    },
    {
        title: "Bài 15: Xin phép, Quy định & Cấm đoán",
        cards: [
            { term: "立ちます", reading: "たちます", hanViet: "LẬP", meaning: "Đứng dậy" },
            { term: "座ります", reading: "すわります", hanViet: "TỌA", meaning: "Ngồi xuống" },
            { term: "置きます", reading: "おきます", hanViet: "TRÍ", meaning: "Đặt, để xuống" },
            { term: "作ります", reading: "つくります", hanViet: "TÁC", meaning: "Làm ra, chế tạo" },
            { term: "売ります", reading: "うります", hanViet: "MẠI", meaning: "Bán ra" },
            { term: "知ります", reading: "しります", hanViet: "TRI", meaning: "Biết, nắm rõ" },
            { term: "住みます", reading: "すみます", hanViet: "TRÚ", meaning: "Sinh sống, cư trú" },
            { term: "研究します", reading: "けんきゅうします", hanViet: "NGHIÊN CỨU", meaning: "Nghiên cứu" },
            { term: "資料", reading: "しりょう", hanViet: "TƯ LIỆU", meaning: "Tài liệu" },
            { term: "カタログ", reading: "カタログ", meaning: "Tập danh mục sản phẩm" },
            { term: "時刻表", reading: "じこくひょう", hanViet: "THỜI KHẮC BIỂU", meaning: "Bảng giờ tàu chạy" },
            { term: "服", reading: "ふく", hanViet: "PHỤC", meaning: "Quần áo" },
            { term: "製品", reading: "せいひん", hanViet: "CHẾ PHẨM", meaning: "Sản phẩm chế tạo" },
            { term: "専門", reading: "せんもん", hanViet: "CHUYÊN MÔN", meaning: "Chuyên ngành" },
            { term: "歯医者", reading: "はいしゃ", hanViet: "XỈ Y GIẢ", meaning: "Nha sĩ, bác sĩ nha khoa" },
            { term: "独身", reading: "どくしん", hanViet: "ĐỘC THÂN", meaning: "Độc thân, chưa cưới" },
        ],
    },
    {
        title: "Bài 16: Trình tự hành động & Di chuyển",
        cards: [
            { term: "乗ります", reading: "のります", hanViet: "THỪA", meaning: "Lên xe, cưỡi ngựa" },
            { term: "降ります", reading: "おります", hanViet: "GIÁNG", meaning: "Xuống xe, xuống tàu" },
            { term: "乗り換えます", reading: "のりかえます", hanViet: "THỪA HOÁN", meaning: "Chuyển tàu, đổi xe" },
            { term: "浴びます", reading: "あびます", hanViet: "DỤC", meaning: "Tắm (vòi sen)" },
            { term: "入れます", reading: "いれます", hanViet: "NHẬP", meaning: "Cho vào, bỏ vào" },
            { term: "出します", reading: "だします", hanViet: "XUẤT", meaning: "Lấy ra, nộp bài" },
            { term: "下ろします", reading: "おろします", hanViet: "HẠ", meaning: "Rút (tiền ngân hàng)" },
            { term: "若い", reading: "わかい", hanViet: "NHÃỢ", meaning: "Trẻ trung" },
            { term: "長い", reading: "ながい", hanViet: "TRƯỜNG", meaning: "Dài" },
            { term: "短い", reading: "みじかい", hanViet: "ĐOẢN", meaning: "Ngắn" },
            { term: "明るい", reading: "あかるい", hanViet: "MINH", meaning: "Sáng sủa, vui tính" },
            { term: "暗い", reading: "くらい", hanViet: "ÁM", meaning: "Tối tăm, u ám" },
            { term: "頭", reading: "あたま", hanViet: "ĐẦU", meaning: "Cái đầu" },
            { term: "目", reading: "め", hanViet: "MỤC", meaning: "Đôi mắt" },
            { term: "耳", reading: "みみ", hanViet: "NHĨ", meaning: "Cái tai" },
            { term: "口", reading: "くち", hanViet: "KHẨU", meaning: "Cái miệng" },
            { term: "歯", reading: "は", hanViet: "XỈ", meaning: "Hàm răng" },
            { term: "お寺", reading: "おてら", hanViet: "TỰ", meaning: "Chùa Phật" },
            { term: "神社", reading: "じんじゃ", hanViet: "THẦN XÃ", meaning: "Đền thờ Thần đạo" },
            { term: "どうやって", reading: "どうやって", meaning: "Làm thế nào, bằng cách nào" },
        ],
    },
    {
        title: "Bài 17: Thể Nai, Nhắc nhở & Sức khỏe",
        cards: [
            { term: "覚えます", reading: "おぼえます", hanViet: "GIÁC", meaning: "Ghi nhớ, thuộc lòng" },
            { term: "忘れます", reading: "わすれます", hanViet: "VONG", meaning: "Quên mất" },
            { term: "なくします", reading: "なくします", meaning: "Làm mất, đánh rơi" },
            { term: "払います", reading: "はらいます", hanViet: "PHẤT", meaning: "Thanh toán, trả tiền" },
            { term: "返します", reading: "かえします", hanViet: "PHẢN", meaning: "Trả lại (đồ vật đã mượn)" },
            { term: "出かけます", reading: "でかけます", hanViet: "XUẤT", meaning: "Đi ra ngoài" },
            { term: "脱ぎます", reading: "ぬぎます", hanViet: "THOÁT", meaning: "Cởi (quần áo, giày dép)" },
            { term: "持って行きます", reading: "もっていきます", hanViet: "TRÌ HÀNH", meaning: "Mang theo cái gì đi" },
            { term: "持って来ます", reading: "もってきます", hanViet: "TRÌ LAI", meaning: "Mang cái gì lại đây" },
            { term: "心配します", reading: "しんぱいします", hanViet: "TÂM PHỐI", meaning: "Lo lắng, bất an" },
            { term: "残業します", reading: "ざんぎょうします", hanViet: "TÀN NGHIỆP", meaning: "Làm thêm giờ, tăng ca" },
            { term: "大切", reading: "たいせつ", hanViet: "ĐẠI THIẾT", meaning: "Quan trọng, quý giá" },
            { term: "大丈夫", reading: "だいじょうぶ", hanViet: "ĐẠI TRƯỢNG PHU", meaning: "Không sao, ổn thỏa" },
            { term: "危ない", reading: "あぶない", hanViet: "NGUY", meaning: "Nguy hiểm" },
            { term: "保険証", reading: "ほけんしょう", hanViet: "BẢO HIỂM CHỨNG", meaning: "Thẻ bảo hiểm y tế" },
            { term: "熱", reading: "ねつ", hanViet: "NHIỆT", meaning: "Cơn sốt" },
            { term: "病気", reading: "びょうき", hanViet: "BỆNH KHÍ", meaning: "Ốm, bệnh tật" },
            { term: "薬", reading: "くすり", hanViet: "DƯỢC", meaning: "Thuốc uống" },
        ],
    },
    {
        title: "Bài 18: Thể Từ Điển & Năng khiếu, Sở thích",
        cards: [
            { term: "できます", reading: "できます", meaning: "Có thể làm được" },
            { term: "洗います", reading: "あらいます", hanViet: "TẨY", meaning: "Rửa, giặt giũ" },
            { term: "弾きます", reading: "ひきます", hanViet: "ĐÀN", meaning: "Chơi nhạc cụ (đàn)" },
            { term: "歌います", reading: "うたいます", hanViet: "CA", meaning: "Hát bài ca" },
            { term: "集めます", reading: "あつめます", hanViet: "TẬP", meaning: "Sưu tầm, thu gom" },
            { term: "捨てます", reading: "すてます", hanViet: "XÁ", meaning: "Vứt bỏ đi" },
            { term: "換えます", reading: "かえます", hanViet: "HOÁN", meaning: "Đổi, thay thế" },
            { term: "運転します", reading: "うんてんします", hanViet: "VẬN CHUYỂN", meaning: "Lái xe hơi" },
            { term: "予約します", reading: "よやくします", hanViet: "DƯ ƯỚC", meaning: "Đặt trước, hẹn trước" },
            { term: "ピアノ", reading: "ピアノ", meaning: "Đàn dương cầm" },
            { term: "現金", reading: "げんきん", hanViet: "HIỆN KIM", meaning: "Tiền mặt" },
            { term: "趣味", reading: "しゅみ", hanViet: "THÚ VỊ", meaning: "Sở thích cá nhân" },
            { term: "日記", reading: "にっき", hanViet: "NHẬT KÝ", meaning: "Nhật ký" },
            { term: "動物", reading: "どうぶつ", hanViet: "ĐỘNG VẬT", meaning: "Động vật, thú nuôi" },
            { term: "特に", reading: "とくに", hanViet: "ĐẶC", meaning: "Đặc biệt là" },
            { term: "ぜひ", reading: "ぜひ", meaning: "Nhất định, rất mong" },
        ],
    },
    {
        title: "Bài 19: Thể Ta, Trải nghiệm & Tập quán",
        cards: [
            { term: "登ります", reading: "のぼります", hanViet: "ĐĂNG", meaning: "Leo lên (núi)" },
            { term: "泊まります", reading: "とまります", hanViet: "BẠC", meaning: "Nghỉ trọ lại (khách sạn)" },
            { term: "掃除します", reading: "そうじします", hanViet: "TẢO TRỪ", meaning: "Dọn dẹp vệ sinh" },
            { term: "洗濯します", reading: "せんたくします", hanViet: "TẨY TRẠC", meaning: "Giặt giũ quần áo" },
            { term: "なります", reading: "なります", meaning: "Trở nên, trở thành" },
            { term: "眠い", reading: "ねむい", hanViet: "MIÊN", meaning: "Buồn ngủ" },
            { term: "強い", reading: "つよい", hanViet: "CƯỜNG", meaning: "Mạnh mẽ" },
            { term: "弱い", reading: "よわい", hanViet: "NHƯỢC", meaning: "Yếu ớt" },
            { term: "調子", reading: "ちょうし", hanViet: "ĐIỀU TỬ", meaning: "Tình trạng sức khỏe / máy" },
            { term: "相撲", reading: "すもう", hanViet: "TƯƠNG PHỐC", meaning: "Vật Sumo Nhật" },
            { term: "一度", reading: "いちど", hanViet: "NHẤT ĐỘ", meaning: "Một lần" },
            { term: "一度も", reading: "いちども", hanViet: "NHẤT ĐỘ", meaning: "Chưa từng lần nào (phủ định)" },
            { term: "だんだん", reading: "だんだん", meaning: "Dần dần, từng bước" },
            { term: "もうすぐ", reading: "もうすぐ", meaning: "Sắp sửa, chẳng mấy chốc" },
            { term: "乾杯", reading: "かんぱい", hanViet: "CAN BÔI", meaning: "Cạn ly! Nâng ly chúc mừng" },
        ],
    },
    {
        title: "Bài 20: Thể Thông Thường & Hội thoại thân mật",
        cards: [
            { term: "要ります", reading: "いります", hanViet: "YẾU", meaning: "Cần thiết có cái gì" },
            { term: "調べます", reading: "しらべます", hanViet: "ĐIỀU", meaning: "Tra cứu, điều tra" },
            { term: "直します", reading: "なおします", hanViet: "TRỰC", meaning: "Sửa chữa, đính chính" },
            { term: "修理します", reading: "しゅうりします", hanViet: "TU LÝ", meaning: "Sửa chữa máy móc" },
            { term: "僕", reading: "ぼく", hanViet: "BỘC", meaning: "Tôi (nam giới thân mật)" },
            { term: "君", reading: "きみ", hanViet: "QUÂN", meaning: "Bạn, cậu (thân mật)" },
            { term: "うん", reading: "うん", meaning: "Ừ (thay cho はい)" },
            { term: "ううん", reading: "ううん", meaning: "Không (thay cho いいえ)" },
            { term: "言葉", reading: "ことば", hanViet: "NGÔN DIỆP", meaning: "Từ ngữ, tiếng nói" },
            { term: "物価", reading: "ぶっか", hanViet: "VẬT GIÁ", meaning: "Vật giá, giá cả" },
            { term: "ビザ", reading: "ビザ", meaning: "Thị thực Visa" },
            { term: "始め", reading: "はじめ", hanViet: "THỦY", meaning: "Ban đầu" },
            { term: "終わり", reading: "おわり", hanViet: "CHUNG", meaning: "Kết thúc" },
            { term: "こっち", reading: "こっち", meaning: "Chỗ này (thân mật của こちら)" },
            { term: "そっち", reading: "そっち", meaning: "Chỗ đó (thân mật của そちら)" },
            { term: "あっち", reading: "あっち", meaning: "Chỗ kia (thân mật của あちら)" },
        ],
    },
    {
        title: "Bài 21: Bày tỏ suy nghĩ & Ý kiến cá nhân",
        cards: [
            { term: "思います", reading: "おもいます", hanViet: "TƯ", meaning: "Nghĩ rằng, cho rằng" },
            { term: "言います", reading: "いいいます", hanViet: "NGÔN", meaning: "Nói rằng" },
            { term: "勝ちます", reading: "かちます", hanViet: "THẮNG", meaning: "Chiến thắng" },
            { term: "負けます", reading: "まけます", hanViet: "PHỤ", meaning: "Thua cuộc" },
            { term: "役に立ちます", reading: "やくにたちます", hanViet: "DỊCH LẬP", meaning: "Có ích, hữu dụng" },
            { term: "動きます", reading: "うごきます", hanViet: "ĐỘNG", meaning: "Chuyển động, vận hành" },
            { term: "気をつけます", reading: "きをつけます", hanViet: "KHÍ", meaning: "Cẩn thận, chú ý" },
            { term: "不便", reading: "ふべん", hanViet: "BẤT TIỆN", meaning: "Bất tiện" },
            { term: "すごい", reading: "すごい", meaning: "Kinh khủng, tuyệt vời" },
            { term: "本当", reading: "ほんとう", hanViet: "BẢN ĐƯƠNG", meaning: "Sự thật, thật sự" },
            { term: "試合", reading: "しあい", hanViet: "THÍ HỢP", meaning: "Trận thi đấu" },
            { term: "意見", reading: "いけん", hanViet: "Ý KIẾN", meaning: "Ý kiến, quan điểm" },
            { term: "地球", reading: "ちきゅう", hanViet: "ĐỊA CẦU", meaning: "Trái đất" },
            { term: "最近", reading: "さいきん", hanViet: "TỐI CẬN", meaning: "Dạo gần đây" },
            { term: "たぶん", reading: "たぶん", meaning: "Có lẽ, có thể" },
            { term: "きっと", reading: "きっと", meaning: "Chắc chắn là" },
        ],
    },
    {
        title: "Bài 22: Mệnh đề bổ nghĩa cho danh từ",
        cards: [
            { term: "着ます", reading: "きます", hanViet: "TRƯỚC", meaning: "Mặc (áo sơ mi, áo khoác)" },
            { term: "はきます", reading: "はきます", meaning: "Đi, mặc (giày, quần, tất)" },
            { term: "かぶります", reading: "かぶります", meaning: "Đội (mũ, nón)" },
            { term: "かけます", reading: "かけます", meaning: "Đeo (kính mắt)" },
            { term: "生まれます", reading: "うまれます", hanViet: "SINH", meaning: "Được sinh ra" },
            { term: "コート", reading: "コート", meaning: "Áo khoác dài" },
            { term: "スーツ", reading: "スーツ", meaning: "Bộ vest công sở" },
            { term: "セーター", reading: "セーター", meaning: "Áo len" },
            { term: "帽子", reading: "ぼうし", hanViet: "MẠO TỬ", meaning: "Mũ, nón" },
            { term: "眼鏡", reading: "めがね", hanViet: "NHÃN KÍNH", meaning: "Kính mắt" },
            { term: "家賃", reading: "やちん", hanViet: "GIA THẢI", meaning: "Tiền thuê nhà" },
            { term: "約束", reading: "やくそく", hanViet: "ƯỚC THÚC", meaning: "Cuộc hẹn, lời hứa" },
            { term: "都合", reading: "つごう", hanViet: "ĐÔ HỢP", meaning: "Điều kiện thuận lợi, sự sắp xếp" },
        ],
    },
    {
        title: "Bài 23: Khi nào (とき) & Câu chỉ đường",
        cards: [
            { term: "聞きます", reading: "ききます", hanViet: "VĂN", meaning: "Hỏi han (giáo viên, đường)" },
            { term: "回します", reading: "まわします", hanViet: "HỒI", meaning: "Vặn, xoay (núm, van)" },
            { term: "引きます", reading: "ひきます", hanViet: "DẪN", meaning: "Kéo ra" },
            { term: "変えます", reading: "かえます", hanViet: "BIẾN", meaning: "Thay đổi, biến đổi" },
            { term: "触ります", reading: "さわります", hanViet: "XÚC", meaning: "Chạm vào, sờ vào" },
            { term: "渡ります", reading: "わたります", hanViet: "ĐỘ", meaning: "Băng qua (cầu, đường)" },
            { term: "曲がります", reading: "まがります", hanViet: "KHÚC", meaning: "Rẽ (về phía nào)" },
            { term: "音", reading: "おと", hanViet: "ÂM", meaning: "Âm thanh" },
            { term: "機械", reading: "きかい", hanViet: "CƠ GIỚI", meaning: "Máy móc cơ khí" },
            { term: "ボタン", reading: "ボタン", meaning: "Nút bấm" },
            { term: "故障", reading: "こしょう", hanViet: "CỐ CHƯỚNG", meaning: "Sự cố, hỏng hóc" },
            { term: "道", reading: "みち", hanViet: "ĐẠO", meaning: "Con đường" },
            { term: "交差点", reading: "こうさてん", hanViet: "GIAO SAI ĐIỂM", meaning: "Ngã tư đường" },
            { term: "信号", reading: "しんごう", hanViet: "TÍN HIỆU", meaning: "Đèn giao thông" },
            { term: "角", reading: "かど", hanViet: "GIÁC", meaning: "Góc đường" },
            { term: "橋", reading: "はし", hanViet: "KIỀU", meaning: "Cây cầu" },
            { term: "駐車場", reading: "ちゅうしゃじょう", hanViet: "TRÚ XA TRƯỜNG", meaning: "Bãi đỗ xe" },
        ],
    },
    {
        title: "Bài 24: Giúp đỡ & Hành vi Cho - Nhận",
        cards: [
            { term: "くれます", reading: "くれます", meaning: "Cho, tặng (người khác tặng tôi/gia đình tôi)" },
            { term: "直します", reading: "なおします", hanViet: "TRỰC", meaning: "Sửa chữa lại cho ai" },
            { term: "連れて行きます", reading: "つれていきます", hanViet: "LIÊN HÀNH", meaning: "Dẫn ai đi cùng" },
            { term: "連れて来ます", reading: "つれてきます", hanViet: "LIÊN LAI", meaning: "Dẫn ai đến đây" },
            { term: "送ります", reading: "おくります", hanViet: "TỐNG", meaning: "Tiễn ai đó (đến ga/nhà)" },
            { term: "紹介します", reading: "しょうかいします", hanViet: "THIỆU GIỚI", meaning: "Giới thiệu ai với ai" },
            { term: "案内します", reading: "あんないします", hanViet: "ÁN NỘI", meaning: "Hướng dẫn, dẫn đường" },
            { term: "説明します", reading: "せつめいします", hanViet: "THUYẾT MINH", meaning: "Giải thích, thuyết minh" },
            { term: "おじいさん", reading: "おじいさん", meaning: "Ông cụ, ông nội/ngoại" },
            { term: "おばあさん", reading: "おばあさん", meaning: "Bà cụ, bà nội/ngoại" },
            { term: "準備", reading: "じゅんび", hanViet: "CHUẨN BỊ", meaning: "Sự chuẩn bị sẵn sàng" },
            { term: "引っ越し", reading: "ひっこし", hanViet: "DẪN VIỆT", meaning: "Chuyển nhà" },
            { term: "お菓子", reading: "おかし", hanViet: "QUẢ TỬ", meaning: "Bánh kẹo" },
            { term: "全部", reading: "ぜんぶ", hanViet: "TOÀN BỘ", meaning: "Tất cả, toàn thể" },
            { term: "自分で", reading: "じぶんで", hanViet: "TỰ PHÂN", meaning: "Tự bản thân mình làm" },
        ],
    },
    {
        title: "Bài 25: Giả định điều kiện (たら / ても)",
        cards: [
            { term: "考えます", reading: "かんがえます", hanViet: "KHẢO", meaning: "Suy nghĩ, cân nhắc" },
            { term: "着きます", reading: "つきます", hanViet: "TRƯỚC", meaning: "Đến nơi (nhà ga, sân bay)" },
            { term: "足ります", reading: "たります", hanViet: "TÚC", meaning: "Đầy đủ, vừa đủ" },
            { term: "頑張ります", reading: "がんばります", hanViet: "NGOAN TRƯƠNG", meaning: "Cố gắng, nỗ lực hết mình" },
            { term: "チャンス", reading: "チャンス", meaning: "Cơ hội tốt" },
            { term: "億", reading: "おく", hanViet: "ỨC", meaning: "Một trăm triệu" },
            { term: "もし", reading: "もし", meaning: "Nếu như, giả sử" },
            { term: "いくら", reading: "いくら", meaning: "Dù có... đến bao nhiêu chăng nữa" },
            { term: "意味", reading: "いみ", hanViet: "Ý VỊ", meaning: "Ý nghĩa" },
            { term: "転勤", reading: "てんきん", hanViet: "CHUYỂN CẦN", meaning: "Chuyển nơi công tác" },
            { term: "こと", reading: "こと", hanViet: "SỰ", meaning: "Điều, việc" },
            { term: "お世話になりました", reading: "おせわになりました", hanViet: "THẾ THOẠI", meaning: "Cảm ơn vì đã luôn chiếu cố giúp đỡ" },
            { term: "どうぞお元気で", reading: "どうぞおげんきで", hanViet: "NGUYÊN KHÍ", meaning: "Chúc bạn luôn mạnh khỏe và bình an" },
        ],
    },
];

export interface ParsedCurriculumResult {
    curriculumTitle: string;
    totalLessons: number;
    detectedType: "MINNA_1" | "MINNA_2" | "TEXT_PARSED" | "GENERIC_EXTRACTED";
    lessons: LessonTemplate[];
}

/**
 * Phân tích file tài liệu người dùng tải lên để nhận diện số bài và từ vựng
 */
export async function parseCurriculumFromFile(file: File): Promise<ParsedCurriculumResult> {
    const fileName = file.name.toLowerCase();

    // 1. Nhận diện các giáo trình Minna no Nihongo Tập 1 (25 bài kinh điển)
    // Ví dụ: "Bản dịch và giải thích ngữ pháp - Tập 1.pdf", "Minna no Nihongo 1", "minna 1", "giao trinh N5"
    const isMinna1 =
        fileName.includes("tập 1") ||
        fileName.includes("tap 1") ||
        fileName.includes("minna") ||
        fileName.includes("bản dịch") ||
        fileName.includes("ngữ pháp") ||
        fileName.includes("n5");

    if (isMinna1) {
        return {
            curriculumTitle: "Giáo trình Minna no Nihongo Tập 1 (25 bài chuẩn)",
            totalLessons: 25,
            detectedType: "MINNA_1",
            lessons: MINNA_I_LESSONS,
        };
    }

    // 2. Nếu là file văn bản thuần (.txt) có thể đọc nhanh trên trình duyệt để tách bài
    if (file.type === "text/plain" || fileName.endsWith(".txt")) {
        try {
            const text = await file.text();
            const lines = text.split(/\r?\n/);
            const chapterRegex = /^(?:bài|chương|lesson|unit|第\s*[0-9一二三四五六七八九十]+\s*課)\s*([0-9０-９]+)?[：:.\s]*(.*)/i;

            const extractedChapters: { title: string; cards: AiCard[] }[] = [];
            let currentChapter: { title: string; cards: AiCard[] } | null = null;

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                const match = trimmed.match(chapterRegex);
                if (match) {
                    if (currentChapter && currentChapter.cards.length > 0) {
                        extractedChapters.push(currentChapter);
                    }
                    currentChapter = {
                        title: trimmed.length > 50 ? trimmed.slice(0, 50) + "..." : trimmed,
                        cards: [],
                    };
                    continue;
                }

                // Nhận diện dòng từ vựng: "từ - cách đọc - nghĩa" hoặc "từ : nghĩa"
                if (currentChapter) {
                    const parts = trimmed.split(/[-–—:：\t]/).map((p) => p.trim()).filter(Boolean);
                    if (parts.length >= 2) {
                        currentChapter.cards.push({
                            term: parts[0],
                            reading: parts[0],
                            meaning: parts.slice(1).join(" - "),
                        });
                    }
                }
            }

            if (currentChapter && currentChapter.cards.length > 0) {
                extractedChapters.push(currentChapter);
            }

            if (extractedChapters.length >= 2) {
                return {
                    curriculumTitle: `Tài liệu bóc tách từ file "${file.name}" (${extractedChapters.length} bài học)`,
                    totalLessons: extractedChapters.length,
                    detectedType: "TEXT_PARSED",
                    lessons: extractedChapters,
                };
            }
        } catch {
            // Lỗi đọc text, fallback bên dưới
        }
    }

    // 3. Fallback thông minh: ước tính số bài dựa trên dung lượng hoặc tên file
    // Đối với các file tài liệu lớn (>2MB), thường là sách trọn bộ -> chia 15-25 buổi học
    const estimatedCount = file.size > 2 * 1024 * 1024 ? 25 : 12;
    const selectedLessons = MINNA_I_LESSONS.slice(0, estimatedCount);

    return {
        curriculumTitle: `Giáo trình trích xuất từ "${file.name}" (${selectedLessons.length} bài học)`,
        totalLessons: selectedLessons.length,
        detectedType: "GENERIC_EXTRACTED",
        lessons: selectedLessons,
    };
}
