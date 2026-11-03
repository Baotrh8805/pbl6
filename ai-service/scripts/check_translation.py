"""Run real long-sentence translation checks without training or downloading models.

From ai-service:
    python scripts/check_translation.py --output translation-check.json
    python scripts/check_translation.py --api --output translation-api-check.json

The API mode exercises FastAPI plus sentence analysis using its in-process HTTP
client. Automated checks cover completeness signals and paragraph breaks, not
semantic accuracy; review the source and translation side by side.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
CASES = Path(__file__).with_name("translation_cases.json")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", action="store_true", help="Exercise the real FastAPI translation endpoint")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    from app.extract import local_translation as mt

    client = None
    headers = {}
    if args.api:
        from fastapi.testclient import TestClient
        from app.main import app
        from app.core.config import settings
        client = TestClient(app)
        if settings.AI_SERVICE_KEY:
            headers["X-Internal-Key"] = settings.AI_SERVICE_KEY
    results = []
    try:
        for case in json.loads(CASES.read_text(encoding="utf-8")):
            source, direction = case["source"], case["direction"]
            record = {"name": case["name"], "source": source, "direction": direction,
                      "source_chars": len(source), "expected_error": case.get("expected_error")}
            started = time.monotonic()
            try:
                if client is None:
                    record["translation"] = mt.translate(source, direction, deadline=started + 150)
                else:
                    response = client.post("/api/dict/translate-text", headers=headers,
                                           json={"text": source, "direction": direction, "withAi": False})
                    response.raise_for_status()
                    body = response.json()
                    record["translation"] = body.get("translation")
                    record["error"] = body.get("reason")
                    record["engine"] = body.get("engine")
                    record["token_count"] = len(body.get("tokens", []))
            except mt.TranslationError as exc:
                record["error"] = exc.reason
            record["seconds"] = round(time.monotonic() - started, 2)
            record["passed"] = record.get("error") == record["expected_error"] and (
                bool(record.get("error")) or bool(record.get("translation")))
            if record.get("translation"):
                record["passed"] &= record["translation"].count("\n") == source.count("\n")
            if client is not None:
                record["passed"] &= record.get("engine") == "local"
            results.append(record)
            print(json.dumps(record, ensure_ascii=False), flush=True)
            # Persist each completed case so interruption does not lose evidence.
            args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    finally:
        if client is not None:
            client.close()
    return 0 if all(item["passed"] for item in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
