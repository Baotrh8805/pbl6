"""Kiểm duyệt bình luận tiếng Việt (spec docs/Plan/specs/2026-10-27-kiem-duyet-ai-va-hlr-design.md).

Hai model do nhóm tự huấn luyện:
- ViHSD 3 lớp (0 sạch / 1 xúc phạm / 2 thù ghét): CNN + BiLSTM Keras, chạy lại bằng numpy từ trọng số đã xuất
  (`models/vihsd_cnn_lstm.npz`, checkpoint tốt nhất epoch 12, test acc 0,8437) — xem `vihsd.py`.
- ViHOS đánh dấu từ vi phạm: PhoBERT-base + lớp phân loại token (B-T / I-T / O), cần torch + transformers
  (`models/phobert_hatespeech_best.pt`) — xem `vihos.py`. Thiếu torch thì chỉ còn model 3 lớp.
"""
