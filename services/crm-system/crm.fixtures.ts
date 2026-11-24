import { CustomerProfile } from './crm.model';

export const CRM_SEED_CUSTOMERS: CustomerProfile[] = [
  { customerId: 'CUS-001', fullName: 'Nguyễn Văn An', tier: 'GOLD', loyaltyPoints: 120, updatedAt: new Date().toISOString() },
  { customerId: 'CUS-002', fullName: 'Trần Thị Bình', tier: 'SILVER', loyaltyPoints: 45, updatedAt: new Date().toISOString() },
  { customerId: 'CUS-003', fullName: 'Lê Minh Cường', tier: 'PLATINUM', loyaltyPoints: 540, updatedAt: new Date().toISOString() },
];
