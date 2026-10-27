import os
from dotenv import load_dotenv
from pydantic import BaseModel

# Tự động nạp biến môi trường từ .env
load_dotenv()

class Settings(BaseModel):
    PROJECT_NAME: str = "PBL6 Japanese AI Service"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    # Model Gemini dùng cho Vision OCR fallback và dịch nghĩa VN (enrich)
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    # Model dự phòng khi model chính trả 429/503 sau các lần thử lại (quota tính riêng theo model); rỗng = không dùng
    GEMINI_FALLBACK_MODEL: str = os.getenv("GEMINI_FALLBACK_MODEL", "")
    # Model thêm (phân tách dấu phẩy) mà backend được phép chọn theo từng request (Admin > Cấu hình > Model AI chính), ngoài
    # GEMINI_MODEL / GEMINI_FALLBACK_MODEL và các model đã đo trong gemini.KNOWN_MODELS; rỗng = chỉ các model đó
    GEMINI_ALLOWED_MODELS: str = os.getenv("GEMINI_ALLOWED_MODELS", "")
    # Đồ thị tri thức (spec 2026-10-27): Neo4j trong docker-compose; mật khẩu mặc định chỉ cho dev (client.py cảnh báo
    # khi URI không phải localhost mà vẫn dùng mặc định)
    NEO4J_URI: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    NEO4J_USER: str = os.getenv("NEO4J_USER", "neo4j")
    NEO4J_PASSWORD: str = os.getenv("NEO4J_PASSWORD", "password123")
    # Trích xuất tài liệu: khoá nội bộ backend → ai-service (rỗng = dev: chỉ nhận request từ localhost, xem core/security.py)
    AI_SERVICE_KEY: str = os.getenv("AI_SERVICE_KEY", "")
    # Bật /docs khi đã đặt AI_SERVICE_KEY (mặc định tắt trên máy chủ có khoá; dev không khoá thì luôn bật)
    AI_SERVICE_DOCS: bool = os.getenv("AI_SERVICE_DOCS", "").lower() in ("1", "true", "yes")
    # Đường dẫn binary Tesseract (Windows cần chỉ rõ), rỗng = dùng PATH
    TESSERACT_CMD: str = os.getenv("TESSERACT_CMD", "")
    # Dưới ngưỡng này OCR chuyển sang Gemini Vision (nếu có key)
    OCR_FALLBACK_CONFIDENCE: float = float(os.getenv("OCR_FALLBACK_CONFIDENCE", "0.85"))
    # Ngân sách Gemini Vision cho CẢ một tài liệu (mọi trang) khi OCR, giây; hết thì các trang còn lại giữ bản Tesseract
    # (spec 21/10). Giữ dưới AI_SERVICE_READ_TIMEOUT của backend (3 phút) trừ thời gian Tesseract.
    OCR_GEMINI_BUDGET_S: int = int(os.getenv("OCR_GEMINI_BUDGET_S", "60"))

settings = Settings()
