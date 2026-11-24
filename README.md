# Craftopia Bot Panel (Vercel + Supabase + Multi-Worker SaaS)

Nền tảng thuê và điều khiển **Minecraft Java Bot** triển khai trên **Vercel**, kết nối **Supabase (PostgreSQL + Realtime)** và điều phối nhiều **512MB Bot Worker** độc lập.

## Kiến trúc
- **Panel & API (`Vercel`)**: Frontend React + Serverless Express API (`/api/index.ts`).
- **Database (`Supabase PostgreSQL`)**: Lưu Users, Sessions, Plans, Subscriptions, Payments, Workers, Bots, Credentials (AES-256-GCM), Bot Assignments, Commands, Audit Logs.
- **Managed Realtime (`Supabase Realtime Broadcast`)**: Truyền lệnh điều phối (`START_BOT`, `STOP_BOT`, `MIGRATION_REQUEST`, `BOT_CONTROL`, `BOT_CHAT`) từ Vercel Serverless tới các Worker kết nối outbound.
- **Bedrock**: Hiển thị **Coming Soon** trên UI, chưa triển khai runtime Bedrock.

## Triển khai lên Vercel
1. Chạy SQL migration trong `supabase/migrations/001_init.sql` trên Supabase.
2. Cấu hình Environment Variables trên Vercel theo `.env.example`.
3. Import thư mục này lên Vercel (Vercel tự đọc `vercel.json`).

## Chạy local & kiểm thử
```bash
npm install
npm --prefix client install
npm run build
npm test
npm start
```
