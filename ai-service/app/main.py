import logging

from fastapi import FastAPI
from app.core.config import settings
from app.api import (nlp_router, kanji_dtw_router, ocr_router, audio_praat_router, extract_router, kanji_info_router,
                     grammar_router, radical_router, mining_router, dict_router, graph_router, moderation_router,
                     hlr_router)

_log = logging.getLogger(__name__)

# /docs, /redoc, /openapi.json: mở khi dev (chưa đặt AI_SERVICE_KEY) hoặc khi AI_SERVICE_DOCS=1; máy chủ có khoá thì tắt —
# không công bố bản đồ endpoint nội bộ.
_docs = settings.AI_SERVICE_DOCS or not settings.AI_SERVICE_KEY

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Microservice xử lý AI: NLP tiếng Nhật, OCR chữ dọc, chấm nét viết (DTW), trọng âm cao thấp, "
                "tra cứu chữ Hán (âm Hán-Việt, thẻ chữ) và quiz chia động từ.",
    docs_url="/docs" if _docs else None,
    redoc_url="/redoc" if _docs else None,
    openapi_url="/openapi.json" if _docs else None,
)

# Không bật CORS: chỉ backend gọi service này (server ↔ server), trình duyệt không gọi thẳng.

if not settings.AI_SERVICE_KEY:
    _log.warning("AI_SERVICE_KEY chưa đặt: chỉ nhận request từ localhost. Trên máy chủ hãy đặt khoá ở cả backend lẫn ai-service.")

# Đăng ký các Router
app.include_router(nlp_router.router, prefix=settings.API_V1_STR)
app.include_router(kanji_dtw_router.router, prefix=settings.API_V1_STR)
app.include_router(ocr_router.router, prefix=settings.API_V1_STR)
app.include_router(audio_praat_router.router, prefix=settings.API_V1_STR)
app.include_router(extract_router.router, prefix=settings.API_V1_STR)
app.include_router(kanji_info_router.router, prefix=settings.API_V1_STR)   # F1 đồ thị Hán-Việt + C5 thẻ chữ Hán
app.include_router(grammar_router.router, prefix=settings.API_V1_STR)      # C7 quiz chia động từ
app.include_router(radical_router.router, prefix=settings.API_V1_STR)      # C4 thẻ bộ thủ + mẹo nhớ
app.include_router(mining_router.router, prefix=settings.API_V1_STR)       # C6 khai thác câu i+1
app.include_router(dict_router.router, prefix=settings.API_V1_STR)         # Từ điển Nhật–Việt (spec 2026-10-26)
app.include_router(graph_router.router, prefix=settings.API_V1_STR)        # Đồ thị tri thức Neo4j + GraphRAG (spec 2026-10-27)
app.include_router(moderation_router.router, prefix=settings.API_V1_STR)   # Kiểm duyệt bình luận ViHSD + ViHOS (spec 2026-10-27 đêm)
app.include_router(hlr_router.router, prefix=settings.API_V1_STR)          # Mô hình trí nhớ HLR (spec 2026-10-27 đêm)

@app.get("/")
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "docs_url": "/docs" if _docs else None
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)  # chỉ backend cùng máy gọi
