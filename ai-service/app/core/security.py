"""Khoá nội bộ backend → ai-service, dùng chung cho mọi router.

Mọi request mang header X-Internal-Key = AI_SERVICE_KEY; khi env rỗng (dev) bỏ kiểm tra.
Tách khỏi extract_router để các route cũ (nlp / ocr / kanji / audio) cũng được bảo vệ cùng một cách.
"""
from __future__ import annotations

from typing import Optional

from fastapi import Header, HTTPException

from app.core.config import settings


def require_internal_key(x_internal_key: Optional[str] = Header(default=None, alias="X-Internal-Key")) -> None:
    if settings.AI_SERVICE_KEY and x_internal_key != settings.AI_SERVICE_KEY:
        raise HTTPException(status_code=401, detail="Invalid internal key")
