from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import (nlp_router, kanji_dtw_router, ocr_router, audio_praat_router, extract_router, kanji_info_router,
                     grammar_router, radical_router, mining_router)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Microservice xử lý AI: NLP tiếng Nhật, OCR chữ dọc, chấm nét viết (DTW), trọng âm cao thấp, "
                "tra cứu chữ Hán (âm Hán-Việt, thẻ chữ) và quiz chia động từ."
)

# Cho phép kết nối CORS từ Web / Mobile
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.get("/")
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "docs_url": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
