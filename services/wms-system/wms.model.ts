export interface InventoryItem {
  sku: string;
  productName: string;
  availableQty: number;
  reservedQty: number;
  unitPrice: number;
  updatedAt: string;
}

export interface ReserveItemInput {
  sku: string;
  quantity: number;
}

export interface ReserveStockRequest {
  orderId: string;
  correlationId: string;
  items: ReserveItemInput[];
}

export interface StockMovement {
  orderId: string;
  sku: string;
  deltaQty: number;
  movementType: 'RESERVE' | 'DEDUCT_CONFIRM' | 'RELEASE';
  correlationId: string;
  createdAt: string;
}
