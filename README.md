# Case Study 02 - Omnichannel Retail Integration (ORI)

Hệ thống demo tích hợp bán lẻ đa kênh cho **ABC Retail** (SE445 — Case Study 02), được xây dựng theo chuẩn Clean Code, Domain Layered Architecture, DevSecOps và SI Monitoring Lab kế thừa từ kiến trúc dự án mẫu.

## 1. Prerequisites
- Windows 10/11 64-bit (hoặc Linux/macOS)
- Node.js LTS `v20+` / `v22+` / `v24+` & npm
- Docker Desktop + Docker Compose (tùy chọn cho chế độ container hóa PostgreSQL + RabbitMQ + Nginx/Kong)

## 2. Configuration
Sao chép file mẫu cấu hình môi trường (không commit file `.env` chứa secret thật lên Git):
```powershell
Copy-Item .env.example .env
```
Các biến quan trọng:
- `POSTGRES_USER`, `POSTGRES_PASSWORD`: Thông tin cụm PostgreSQL chứa 4 logical DBs (`order_db`, `wms_db`, `crm_db`, `tms_db`).
- `RABBITMQ_URL`: Kết nối AMQP tới Topic Exchange `retail.events` và DLX `retail.dlx`.
- `JWT_SECRET`, `RATE_LIMIT_MAX_PER_MIN`: Bảo mật Gateway (mặc định `100` req/phút).
- `GEMINI_API_KEY`: API Key Google Gemini (nếu để trống, module AI POS Data Mapping tự động dùng chế độ Offline Regex/CSV Fallback an toàn).

## 3. Start Infrastructure & Services

### Cách A: Chạy Demo Nhanh (Zero-Docker Local Mode — 1 Lệnh)
Chạy đồng thời 4 microservices (`wms :3001`, `crm :3002`, `tms :3003`, `order-process :3004`), Gateway hợp nhất (`:8080`) và **SI Monitoring & Testing Lab UI**:
```powershell
npm install
npm run start
```
Mở trình duyệt tại: **http://localhost:8080**

### Cách B: Chạy Hạ tầng Docker (PostgreSQL + RabbitMQ + Kong) hoặc Full Stack
Khởi chạy chỉ hạ tầng (PostgreSQL 4 DBs, RabbitMQ Management `:15672`, Kong DB-less `:8000`):
```powershell
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml ps
```
Hoặc khởi chạy toàn bộ stack Production (`postgres`, `rabbitmq`, `wms-system`, `crm-system`, `tms-system`, `order-process`, `nginx-gateway :8080`):
```powershell
docker compose up -d --build
```

## 4. Test
- **Kiểm tra TypeScript Strict Mode & Bộ Test Tự Động (Unit + API + Integration + E2E + Failure `TC01`–`TC10`):**
  ```powershell
  npm run typecheck
  npm test
  ```
- **Kiểm tra nhanh bằng curl / Postman:**
  Import file `tests/postman/ORI_CaseStudy02.postman_collection.json` hoặc chạy:
  ```powershell
  curl http://localhost:8080/health
  curl http://localhost:8080/api/v1/wms/inventory/SKU-001
  curl -X POST http://localhost:8080/api/v1/orders -H "Content-Type: application/json" -d "{\"channel\":\"WEB_BRANCH_01\",\"customerId\":\"CUS-001\",\"items\":[{\"sku\":\"SKU-001\",\"quantity\":2,\"unitPrice\":150000}]}"
  ```

## 5. Stop / Reset
- Dừng container nhưng giữ nguyên dữ liệu volume:
  ```powershell
  docker compose down
  ```
- **Cảnh báo:** Lệnh dưới đây xóa toàn bộ volume dữ liệu PostgreSQL thử nghiệm để khởi tạo lại `01-init.sql` từ đầu:
  ```powershell
  docker compose down -v
  ```

## 6. Troubleshooting
- **Port `8080` hoặc `3001`–`3004` đã bị chiếm:** Đổi `GATEWAY_PORT`, `WMS_PORT`, `CRM_PORT`, `TMS_PORT`, `ORDER_PORT` trong `.env`.
- **Docker báo lỗi `pipe/dockerDesktopLinuxEngine`:** Mở Docker Desktop trước khi chạy `docker compose`, hoặc dùng Cách A (`npm run start`) để demo ngay không cần Docker.
- **Lỗi xác thực PostgreSQL khi sửa `01-init.sql`:** Chạy `docker compose down -v` rồi `up -d` lại.
