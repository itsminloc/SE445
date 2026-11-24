export type ShipmentStatus = 'PENDING_PICKUP' | 'IN_TRANSIT' | 'DELIVERED';

export interface ShipmentRecord {
  shipmentId: string;
  orderId: string;
  shippingAddress: Record<string, unknown>;
  carrier: string;
  status: ShipmentStatus;
  correlationId: string;
  createdAt: string;
}

export interface CreateShipmentRequest {
  eventId?: string;
  orderId: string;
  shippingAddress?: Record<string, unknown>;
  carrier?: string;
  correlationId: string;
}
