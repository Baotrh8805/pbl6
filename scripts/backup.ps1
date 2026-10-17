# Sao lưu cơ sở dữ liệu (UC-42) bằng pg_dump, định dạng custom (khôi phục bằng pg_restore).
# Dùng: .\scripts\backup.ps1 [-Keep 14] [-OutDir backups]
# Kết nối lấy từ biến môi trường (giống backend): DB_URL (jdbc:postgresql://host:port/db?...), DB_USERNAME, DB_PASSWORD.
# Không ghi mật khẩu ra màn hình hay file; thư mục backups/ nằm trong .gitignore.
param(
    [int]$Keep = 14,
    [string]$OutDir = "backups"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    Write-Error "Không tìm thấy pg_dump. Cài PostgreSQL client (https://www.postgresql.org/download/) và thêm vào PATH."
}
if (-not $env:DB_URL -or -not $env:DB_USERNAME -or -not $env:DB_PASSWORD) {
    Write-Error "Cần DB_URL, DB_USERNAME, DB_PASSWORD trong biến môi trường (xem docs/SUPABASE_SETUP.md)."
}

# jdbc:postgresql://host:port/db?sslmode=require -> postgresql://user@host:port/db?sslmode=require
$url = $env:DB_URL -replace '^jdbc:', ''
$url = $url -replace '^postgresql://', ("postgresql://" + [uri]::EscapeDataString($env:DB_USERNAME) + "@")
# Supabase: pooler 6543 chạy transaction mode, pg_dump cần phiên thật -> dùng cổng 5432 khi URL trỏ 6543
$url = $url -replace ':6543/', ':5432/'
$url = $url -replace '[?&]prepareThreshold=\d+', ''

New-Item -ItemType Directory -Force $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$file = Join-Path $OutDir "pbl6-$stamp.dump"

$env:PGPASSWORD = $env:DB_PASSWORD
try {
    & pg_dump --format=custom --no-owner --no-privileges --file $file $url
    if ($LASTEXITCODE -ne 0) { throw "pg_dump thoát mã $LASTEXITCODE" }
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

$size = [math]::Round((Get-Item $file).Length / 1MB, 2)
Write-Host "Đã sao lưu: $file ($size MB)"

# Giữ $Keep bản mới nhất
Get-ChildItem $OutDir -Filter "pbl6-*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep |
    ForEach-Object { Remove-Item $_.FullName; Write-Host "Đã xoá bản cũ: $($_.Name)" }
