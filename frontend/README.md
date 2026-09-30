# NihonGen – Frontend

React 19 + TypeScript + Vite + Tailwind CSS 3. Gọi backend qua proxy Vite: `/api` -> `http://localhost:8080`
(đổi cổng bằng biến `BE_PORT`).

## Lệnh

```bash
npm install
npm run dev        # http://localhost:5173
npm run lint       # oxlint
npm run build      # tsc -b + vite build
npm run selfcheck  # kiểm hàm thuần trong scripts/selfCheck.ts (Node >= 22.18)
```

Chạy cả backend + frontend bằng một lệnh từ thư mục gốc: `npm run dev`.

## Cấu trúc

Xem [docs/CODEBASE_MAP.md](../docs/CODEBASE_MAP.md#3-frontend-frontend-react-19--vite--tailwind-3).
