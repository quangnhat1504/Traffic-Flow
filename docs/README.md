# Danh Mục Tài Liệu Kỹ Thuật (TrafficFlow Edge AI)

Tài liệu dự án được tổ chức phân tầng rõ ràng theo chuẩn công nghệ phân tán và tính toán biên:

---

## 1. Bản Đồ Tài Liệu (Documentation Map)

| Danh mục | Thư mục / Tập tin | Nội dung chính |
| :--- | :--- | :--- |
| **Kiến Trúc & Sơ Đồ** | [architecture/README.md](architecture/README.md) | Sơ đồ hệ thống Excalidraw, luồng xử lý video và biên dịch RKNN |
| **Đồ Thị Tri Thức** | [knowledge_graph/](knowledge_graph/) | Design-OS Universal Knowledge Pipeline, UKMC.v1 Stopping Gate |
| **Quản Trị & Tiêu Chí** | [governance/](governance/) | Tiêu chí chấm điểm benchmark, Roster đội ngũ Agent, Lộ trình dài hạn |
| **Triển Khai Biên** | [deployment/ORANGE_PI_5_DEPLOYMENT_GUIDE.md](deployment/ORANGE_PI_5_DEPLOYMENT_GUIDE.md) | Triển khai NPU Rockchip RK3588, Docker ARM64, Tailscale proxy |
| **Vận Hành Offline** | [deployment/LOCAL_OFFLINE_SETUP.md](deployment/LOCAL_OFFLINE_SETUP.md) | Chế độ Local Sovereign Mode với SQLite WAL, zero-cloud fallback |
| **Hướng Dẫn Sử Dụng** | [HUONG_DAN_SU_DUNG.md](HUONG_DAN_SU_DUNG.md) | Sổ tay vận hành API, Studio vẽ làn đường Canvas, HLS streaming |
| **Hợp Đồng API** | [contracts/API_CONTRACTS.md](contracts/API_CONTRACTS.md) | Đặc tả JSON Schema cho REST endpoints, Task lifecycle & Video counting |
| **Nhật Ký Xác Nhận** | [DESIGN_QUESTIONS_AND_CONFIRMATIONS.md](DESIGN_QUESTIONS_AND_CONFIRMATIONS.md) | Ghi nhận quyết định kỹ thuật và phản hồi của người dùng |

---

## 2. Tiêu Chuẩn Lưu Trữ
- Toàn bộ ghi chú cũ, sprint log không còn sử dụng được đưa vào `docs/archive/` để giữ không gian ngữ cảnh (agent context) luôn tinh gọn và chính xác.
- Mọi sơ đồ kỹ thuật mới được lưu trữ tại `docs/architecture/figures/` với đầy đủ 4 định dạng: `.excalidraw` (nguồn vector mở), `.svg` (vector web), `-light.png` và `-dark.png` (ảnh hiển thị GitHub).
