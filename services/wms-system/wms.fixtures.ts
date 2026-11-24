import { InventoryItem } from './wms.model';

export const WMS_SEED_INVENTORY: InventoryItem[] = [
  { sku: 'SKU-001', productName: 'Laptop Gaming ABC Pro 15', availableQty: 20, reservedQty: 0, unitPrice: 150000, updatedAt: new Date().toISOString() },
  { sku: 'SKU-002', productName: 'Bàn phím Cơ Wireless K2', availableQty: 5, reservedQty: 0, unitPrice: 450000, updatedAt: new Date().toISOString() },
  { sku: 'SKU-003', productName: 'Chuột Không dây UltraLight', availableQty: 50, reservedQty: 0, unitPrice: 290000, updatedAt: new Date().toISOString() },
  { sku: 'SKU-004', productName: 'Màn hình 27 inch 4K IPS', availableQty: 3, reservedQty: 0, unitPrice: 6500000, updatedAt: new Date().toISOString() },
  { sku: 'SKU-005', productName: 'Tai nghe Studio ANC', availableQty: 0, reservedQty: 0, unitPrice: 1200000, updatedAt: new Date().toISOString() },
];
