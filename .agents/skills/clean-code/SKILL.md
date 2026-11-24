---
name: clean-code
description: Enforces Clean Code, Single Responsibility Principle (SRP), modular layered boundaries, and multi-service organization for SE445 ORI (adapted from CyberRig Clean Code Skill).
---

# Clean Code & Architectural Standards for SE445 ORI

Tài liệu quy chuẩn kỹ thuật định hướng viết mã nguồn sạch (Clean Code), thiết kế phân tầng (Layered Architecture), tuân thủ nguyên tắc đơn trách nhiệm (SRP) và cấu trúc Multi-Service cho hệ thống tích hợp bán lẻ đa kênh **ORI (ABC Retail)**.

## 1. Nguyên Tắc Cốt Lõi (Core Principles)

### 1.1. Single Responsibility Principle (SRP)
- Mỗi file, class hoặc hàm chỉ đảm nhận **một trách nhiệm duy nhất**.
- **Giới hạn độ dài tệp (`<= 300 dòng`)**: Không để bất kỳ file mã nguồn nào vượt quá **300 dòng**. Nếu phình to, tách thành:
  - `*.fixtures.ts` / `*.seed.ts`: Dữ liệu mẫu, seed tồn kho, khách hàng mẫu.
  - `*.rules.ts` / `*.validator.ts`: Bộ kiểm tra đầu vào, quy đổi điểm, quy tắc chuyển trạng thái.
  - `*.util.ts`: Hàm phụ trợ thuần túy (PII masking, parser fallback, formatting).

### 1.2. Phân Tầng Trách Nhiệm (Layered Service Boundaries)
- **Model (`*.model.ts`)**: Interfaces, types, enums, DTOs. Không chứa logic SQL hay HTTP.
- **Repository (`*.repository.ts`)**: Thao tác PostgreSQL (kèm transactional fallback cho test/local không Docker). Đảm bảo conditional update & idempotency constraints.
- **Service (`*.service.ts`)**: Điều phối nghiệp vụ, gọi repository, gọi System APIs, phát/nhận sự kiện RabbitMQ. Không trực tiếp xử lý `req`/`res`.
- **Controller (`*.controller.ts`)**: Trích xuất HTTP params/body/headers (`X-Correlation-ID`), gọi Service, trả HTTP status chuẩn (`200/202/400/404/409/503`).
- **Routes (`*.routes.ts`)**: Khai báo URI endpoint, gắn middleware Auth/RateLimit/Correlation và ánh xạ Controller.

## 2. Checklist Trước Khi Nghiệm Thu (Refactor & Review Checklist)
- [ ] File mới/sửa có `<= 300` dòng và không nhồi dữ liệu seed vào business service không?
- [ ] Controller có tách biệt hoàn toàn khỏi SQL/AMQP không?
- [ ] Mọi lỗi nghiệp vụ có dùng `DomainError` chuẩn và qua `errorHandler` không?
- [ ] `npx tsc --noEmit` thoát mã `0` và `npm test` pass 100% chưa?
- [ ] Không commit mật khẩu/API key thật (`.env.example` sạch sẽ)?
