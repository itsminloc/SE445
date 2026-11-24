import { eventBus, EventEnvelope } from '../shared-core';
import { orderRepository } from './order.repository';

/**
 * Listens to completion events from WMS/CRM/TMS to maintain Eventual Consistency
 * on `order_db` (PROCESSING -> READY_TO_SHIP).
 */
export async function registerOrderStatusSubscribers(): Promise<void> {
  await eventBus.subscribe('order.wms-completed', 'wms.completed', async (event) => {
    const { orderId } = (event as EventEnvelope<{ orderId: string }>).data;
    await orderRepository.markSubstep(orderId, { wmsStatus: 'DEDUCTED' });
  });

  await eventBus.subscribe('order.crm-completed', 'crm.completed', async (event) => {
    const { orderId } = (event as EventEnvelope<{ orderId: string }>).data;
    await orderRepository.markSubstep(orderId, { crmStatus: 'POINTS_AWARDED' });
  });

  await eventBus.subscribe('order.tms-completed', 'tms.completed', async (event) => {
    const { orderId } = (event as EventEnvelope<{ orderId: string }>).data;
    await orderRepository.markSubstep(orderId, { tmsStatus: 'SHIPMENT_CREATED' });
  });
}
