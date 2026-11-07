"""Khoá nội bộ backend → ai-service, dùng chung cho mọi router.

Mọi request mang header X-Internal-Key = AI_SERVICE_KEY (so sánh thời gian hằng). Khi env rỗng (dev) KHÔNG mở cho mọi
nơi: chỉ nhận request từ chính máy này (loopback) — quên đặt khoá trên máy chủ thì người ngoài vẫn không gọi thẳng được
OCR / Gemini (tốn quota, file "bom" ảnh). Tách khỏi extract_router để các route cũ (nlp / ocr / kanji / audio) cũng được
bảo vệ cùng một cách.
"""
from __future__ import annotations

import hmac
from typing import Optional

from fastapi import Header, HTTPException, Request

from app.core.config import settings

# "testclient": host mà Starlette TestClient gắn cho request trong pytest (socket thật luôn là địa chỉ IP)
LOCAL_HOSTS = frozenset({"127.0.0.1", "::1", "localhost", "testclient"})


def require_internal_key(request: Request,
                         x_internal_key: Optional[str] = Header(default=None, alias="X-Internal-Key")) -> None:
    if settings.AI_SERVICE_KEY:
        if not x_internal_key or not hmac.compare_digest(x_internal_key.encode(), settings.AI_SERVICE_KEY.encode()):
            raise HTTPException(status_code=401, detail="Invalid internal key")
        return
    host = request.client.host if request.client else None
    if host not in LOCAL_HOSTS:
        raise HTTPException(status_code=401, detail="AI_SERVICE_KEY chưa đặt: chỉ nhận request từ localhost")
