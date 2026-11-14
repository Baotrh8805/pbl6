"""Mô hình trí nhớ nửa đời (half-life regression, spec docs/Plan/specs/2026-10-27-kiem-duyet-ai-va-hlr-design.md §8).

Bản "portable logistic" do nhóm huấn luyện trên 13 triệu lượt học Duolingo (halflife-regression-4.ipynb): chỉ cần số lần đã học /
đúng và khoảng cách thời gian, không cần id từ hay người học nên dùng được cho thẻ tiếng Nhật. Trọng số xuất ra JSON
(`data/hlr_portable.json`, ~0,7 MB) và chạy bằng numpy — ai-service không cần torch cho phần này.
"""
