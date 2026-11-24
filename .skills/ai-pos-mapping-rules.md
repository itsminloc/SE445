# AI POS Data Mapping Rules (SE445 Case Study 02)

1. **Bảo mật & Che PII trước khi gọi AI**:
   - Luôn chạy `maskPhone`, `maskEmail`, `sanitizeTextInput` trước khi đưa nội dung hóa đơn POS thô tới Gemini API.
   - Tuyệt đối không đưa `JWT_SECRET`, `POSTGRES_PASSWORD`, `GEMINI_API_KEY` vào prompt hoặc log.

2. **Structured Output & Validation**:
   - Đầu ra bắt buộc tuân theo Canonical Order JSON (`channel`, `customerId`, `items[{ sku, quantity, unitPrice }]`, `totalAmount`).
   - Validate kiểu dữ liệu và công thức `totalAmount = sum(quantity * unitPrice)` sau khi AI trả về.

3. **Template Cache & Offline Fallback**:
   - Lưu cache theo cấu trúc mẫu biên lai POS đã parse thành công để giảm lượt gọi AI lặp lại.
   - Khi không có `GEMINI_API_KEY` hoặc mất mạng/hết quota, tự động chuyển sang bộ phân tích `Regex / CSV` nội bộ bảo đảm luồng POS không gián đoạn.
