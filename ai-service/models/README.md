# `ai-service/models/` — model tự huấn luyện (không commit)

Thư mục này nằm trong `.gitignore` (trừ `MANIFEST.json` và file này). Nội dung, cách dùng và số liệu đo: spec
[docs/Plan/specs/2026-10-27-kiem-duyet-ai-va-hlr-design.md](../../docs/Plan/specs/2026-10-27-kiem-duyet-ai-va-hlr-design.md) §2, §9.

| File | Dùng cho | Bắt buộc? |
|---|---|---|
| `vihsd_cnn_lstm.npz` | Kiểm duyệt: phân lớp câu 0 sạch / 1 xúc phạm / 2 thù ghét (numpy) | Có (thiếu → `/api/moderation/check` 503, backend để bình luận ở PENDING) |
| `phobert_hatespeech_best.pt` + `phobert-base/` (vocab.txt, bpe.codes, config.json) | Kiểm duyệt: đánh dấu từ vi phạm (PhoBERT, cần `pip install -r requirements-ml.txt`) | Không (thiếu → không có từ đánh dấu, không chặn tự động — chỉ gắn cờ) |
| `best-halflife-portable.pt` | Nguồn của `app/hlr/data/hlr_portable.json` (đã commit) | Không |
| `hatespeech_model.pt` | Trọng số epoch cuối của ViHSD (quá khớp) — **không dùng**, giữ để đối chiếu | Không |

Lấy file:

```bash
# máy dev: chép từ thư mục đã có (ví dụ bản sao trên ổ D) rồi kiểm sha256
python scripts/fetch_models.py --from "D:/University/PBL6/model-files"
# máy chủ: điền url vào MANIFEST.json (Google Drive / Hugging Face / S3 link tải thẳng) rồi
python scripts/fetch_models.py
# tokenizer PhoBERT: chép từ cache Hugging Face nếu có, không thì tải từ Hub (cần mạng)
python scripts/fetch_models.py --phobert-tokenizer
```

Biến môi trường: `MODELS_DIR` đổi thư mục; `MODERATION_SPANS=0` tắt PhoBERT (máy ít RAM); `MODERATION_THREADS` số luồng torch.
Cờ `GET /api/extract/health`: `moderation`, `moderationSpans`, `hlr`.
