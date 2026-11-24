# ORI Integration Rules (SE445 Case Study 02)

1. **Synchronous Flow (`< 200ms`)**:
   - Chỉ sử dụng cho xác thực JWT, tra cứu tồn kho (`GET /api/v1/wms/inventory/:sku`), giữ chỗ tồn kho nguyên tử (`POST /api/v1/wms/inventory/reserve`) và tra cứu đơn (`GET /api/v1/orders/:id`).
   - Khi hết hàng (`available_qty < quantity`), trả ngay `409 Conflict` và tuyệt đối **không** phát `order.created`.
   - Khi SKU không tồn tại, trả `404 Not Found` và không phát event.

2. **Asynchronous Flow (`HTTP 202 Accepted`)**:
   - Khi kiểm tra & giữ chỗ tồn kho thành công, lưu đơn vào `order_db` với trạng thái `PROCESSING`, phát sự kiện `order.created` tới Topic Exchange `retail.events` (với Publisher Confirm), và trả về `HTTP 202 Accepted` cùng `orderId` và `correlationId`.
   - Khi RabbitMQ mất kết nối (`TC07`), tuyệt đối không trả `202` giả; ghi nhận vào `outbox_events` (`PENDING_RETRY`) hoặc hoàn giữ chỗ và trả `503 Service Unavailable`.

3. **Reliability & Data Consistency**:
   - **Idempotency (`TC06`)**: Mọi consumer (`wms`, `crm`, `tms`) phải kiểm tra & chèn bảng `processed_events(event_id, order_id)` trong cùng transaction; trùng `eventId` hoặc `orderId` phải ACK và bỏ qua an toàn.
   - **Concurrency Locking (`TC08`)**: Dùng `UPDATE inventory SET available_qty = available_qty - $1, reserved_qty = reserved_qty + $1 WHERE sku = $2 AND available_qty >= $1` (hoặc atomic mutex tương đương ở in-memory mode) bảo đảm tồn kho không bao giờ âm.
   - **Retry & DLQ (`TC05`)**: Thử lại tối đa 3 lần khi lỗi tạm thời; vượt quá 3 lần NACK (`requeue=false`) để chuyển sang `retail.dlx` -> `retail.dlq`.
   - **Correlation ID**: Lan truyền `X-Correlation-ID` xuyên suốt HTTP headers, log JSON và RabbitMQ message properties.
