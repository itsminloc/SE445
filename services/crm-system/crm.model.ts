export interface CustomerProfile {
  customerId: string;
  fullName: string;
  tier: 'SILVER' | 'GOLD' | 'PLATINUM';
  loyaltyPoints: number;
  updatedAt: string;
}

export interface AwardPointsRequest {
  eventId: string;
  orderId: string;
  customerId: string;
  points: number;
  correlationId: string;
}

export interface PointTransaction {
  orderId: string;
  customerId: string;
  points: number;
  correlationId: string;
  createdAt: string;
}
