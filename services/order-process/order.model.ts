export type OrderStatus = 'PROCESSING' | 'CONFIRMED' | 'READY_TO_SHIP' | 'PARTIAL_FAILED' | 'FAILED';

export interface CanonicalOrderItem {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface ShippingAddress {
  recipient?: string;
  street: string;
  city: string;
}

export interface CanonicalOrderRequest {
  channel: string;
  branchId?: string;
  customerId: string;
  items: CanonicalOrderItem[];
  shippingAddress?: ShippingAddress;
  simulateTmsFailure?: boolean;
}

export interface OrderRecord {
  orderId: string;
  customerId: string;
  channel: string;
  status: OrderStatus;
  wmsStatus: 'RESERVED' | 'DEDUCTED' | 'FAILED';
  crmStatus: 'PENDING' | 'POINTS_AWARDED' | 'FAILED';
  tmsStatus: 'PENDING' | 'SHIPMENT_CREATED' | 'DLQ_QUARANTINED';
  totalAmount: number;
  correlationId: string;
  items: CanonicalOrderItem[];
  shippingAddress?: ShippingAddress;
  createdAt: string;
  updatedAt: string;
}

export interface OutboxEventRecord {
  eventId: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: 'PUBLISHED' | 'PENDING_RETRY';
  createdAt: string;
  publishedAt?: string;
}

export interface AiMappingResult {
  engine: 'GEMINI_API' | 'TEMPLATE_CACHE' | 'OFFLINE_FALLBACK';
  maskedInput: string;
  canonicalOrder: CanonicalOrderRequest & { totalAmount: number };
  confidenceScore: number;
  latencyMs: number;
}
