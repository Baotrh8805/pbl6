from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import nlp_router, kanji_dtw_router, ocr_router, audio_praat_router, extract_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Microservice xử lý AI, NLP tiếng Nhật, OCR chữ dọc, DTW nét viết và Praat pitch accent."
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
