#!/usr/bin/env bash
# Sao lưu cơ sở dữ liệu (UC-42) bằng pg_dump, định dạng custom (khôi phục bằng pg_restore).
# Dùng: scripts/backup.sh [KEEP=14] [OUT_DIR=backups]   (ví dụ cron: 0 3 * * * cd /srv/pbl6 && scripts/backup.sh)
# Kết nối lấy từ biến môi trường (giống backend): DB_URL (jdbc:postgresql://host:port/db?...), DB_USERNAME, DB_PASSWORD.
set -euo pipefail

KEEP="${KEEP:-14}"
OUT_DIR="${OUT_DIR:-backups}"

command -v pg_dump >/dev/null || { echo "Không tìm thấy pg_dump (cài postgresql-client)." >&2; exit 1; }
: "${DB_URL:?Cần DB_URL}" "${DB_USERNAME:?Cần DB_USERNAME}" "${DB_PASSWORD:?Cần DB_PASSWORD}"

# jdbc:postgresql://host:port/db?sslmode=require -> postgresql://user@host:port/db?sslmode=require
url="${DB_URL#jdbc:}"
url="${url/postgresql:\/\//postgresql://${DB_USERNAME}@}"
# Supabase: pooler 6543 (transaction mode) không dùng được cho pg_dump -> cổng 5432
url="${url/:6543\//:5432/}"
url="$(printf '%s' "$url" | sed -E 's/[?&]prepareThreshold=[0-9]+//')"

mkdir -p "$OUT_DIR"
file="$OUT_DIR/pbl6-$(date +%Y%m%d-%H%M).dump"

PGPASSWORD="$DB_PASSWORD" pg_dump --format=custom --no-owner --no-privileges --file "$file" "$url"
echo "Đã sao lưu: $file ($(du -h "$file" | cut -f1))"

# Giữ KEEP bản mới nhất
ls -1t "$OUT_DIR"/pbl6-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old" && echo "Đã xoá bản cũ: $old"
done
