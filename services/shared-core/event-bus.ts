import amqplib, { ConfirmChannel, ChannelModel, ConsumeMessage } from 'amqplib';
import { oriConfig } from './config';
import { BrokerUnavailableError } from './domain.error';

export interface EventEnvelope<T = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  eventVersion: string;
  occurredAt: string;
  correlationId: string;
  sourceChannel: string;
  data: T;
}

export interface DlqEntry {
  id: string;
  queueName: string;
  exchange: string;
  routingKey: string;
  event: EventEnvelope;
  errorReason: string;
  retryCount: number;
  maxRetries: number;
  rejectedAt: string;
  status: 'PENDING_INSPECTION' | 'REPLAYED';
}

export type EventHandler = (event: EventEnvelope, attempt: number) => Promise<void>;

interface QueueRegistration {
  queueName: string;
  routingKey: string;
  handler: EventHandler;
  paused: boolean;
  buffered: Array<{ event: EventEnvelope; attempt: number }>;
}

/**
 * Dual-Mode Integration Event Bus:
 * - Uses real RabbitMQ (amqplib ConfirmChannel, Topic Exchange, Manual ACK, DLX/DLQ) when available.
 * - Falls back seamlessly to deterministic In-Process AMQP Emulator when Docker RabbitMQ is offline or in test mode.
 */
export class IntegrationEventBus {
  private static instance: IntegrationEventBus | null = null;
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private mode: 'RABBITMQ' | 'IN_MEMORY' = 'IN_MEMORY';
  private brokerOnline = true;
  private queues = new Map<string, QueueRegistration>();
  private dlqStore: DlqEntry[] = [];
  private metrics = { published: 0, processed: 0, retries: 0 };
  private onActivityHooks: Array<(entry: { channel: string; level: string; source: string; message: string }) => void> = [];

  static getInstance(): IntegrationEventBus {
    if (!IntegrationEventBus.instance) {
      IntegrationEventBus.instance = new IntegrationEventBus();
    }
    return IntegrationEventBus.instance;
  }

  onActivity(hook: (entry: { channel: string; level: string; source: string; message: string }) => void): void {
    this.onActivityHooks.push(hook);
  }

  private emitActivity(channel: string, level: string, source: string, message: string): void {
    for (const h of this.onActivityHooks) h({ channel, level, source, message });
  }

  async connect(): Promise<'RABBITMQ' | 'IN_MEMORY'> {
    if (process.env.USE_IN_MEMORY_BROKER === 'true' || process.env.NODE_ENV === 'test') {
      this.mode = 'IN_MEMORY';
      return this.mode;
    }
    try {
      this.connection = await amqplib.connect(oriConfig.rabbitmq.url, { timeout: 1500 });
      this.channel = await this.connection.createConfirmChannel();
      await this.channel.assertExchange(oriConfig.rabbitmq.exchange, 'topic', { durable: true });
      await this.channel.assertExchange(oriConfig.rabbitmq.dlx, 'direct', { durable: true });
      await this.channel.assertQueue(oriConfig.rabbitmq.dlq, { durable: true });
      await this.channel.bindQueue(oriConfig.rabbitmq.dlq, oriConfig.rabbitmq.dlx, 'dlq.retail');
      this.mode = 'RABBITMQ';
      this.emitActivity('BROKER', 'INFO', 'RabbitMQ', `Connected to AMQP (${oriConfig.rabbitmq.exchange})`);
      return this.mode;
    } catch {
      this.mode = 'IN_MEMORY';
      this.emitActivity('BROKER', 'INFO', 'LocalBroker', 'RabbitMQ unreachable — using In-Process AMQP Emulator');
      return this.mode;
    }
  }

  async subscribe(queueName: string, routingKey: string, handler: EventHandler): Promise<void> {
    const reg: QueueRegistration = { queueName, routingKey, handler, paused: false, buffered: [] };
    this.queues.set(queueName, reg);

    if (this.mode === 'RABBITMQ' && this.channel) {
      await this.channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': oriConfig.rabbitmq.dlx,
          'x-dead-letter-routing-key': 'dlq.retail',
        },
      });
      await this.channel.bindQueue(queueName, oriConfig.rabbitmq.exchange, routingKey);
      await this.channel.consume(queueName, async (msg: ConsumeMessage | null) => {
        if (!msg || !this.channel) return;
        const headers = msg.properties.headers || {};
        const attempt = Number(headers['x-retry-count'] || 0) + 1;
        try {
          const event = JSON.parse(msg.content.toString('utf8')) as EventEnvelope;
          await handler(event, attempt);
          this.metrics.processed += 1;
          this.channel.ack(msg);
        } catch (err) {
          if (attempt < oriConfig.rabbitmq.maxRetries) {
            this.metrics.retries += 1;
            this.channel.ack(msg);
            this.channel.sendToQueue(queueName, msg.content, {
              persistent: true,
              correlationId: msg.properties.correlationId,
              headers: { ...headers, 'x-retry-count': attempt },
            });
          } else {
            this.recordDlq(queueName, routingKey, JSON.parse(msg.content.toString('utf8')) as EventEnvelope, (err as Error).message, attempt);
            this.channel.nack(msg, false, false);
          }
        }
      });
    }
  }

  async publish(routingKey: string, event: EventEnvelope): Promise<void> {
    if (!this.brokerOnline) {
      this.emitActivity('BROKER', 'ERROR', 'EventBus', `Publish failed for ${event.eventId}: Broker offline`);
      throw new BrokerUnavailableError('RabbitMQ kết nối thất bại (Simulated/Network Outage).', { eventId: event.eventId });
    }

    this.metrics.published += 1;
    if (this.mode === 'RABBITMQ' && this.channel) {
      await new Promise<void>((resolve, reject) => {
        this.channel!.publish(
          oriConfig.rabbitmq.exchange,
          routingKey,
          Buffer.from(JSON.stringify(event)),
          { persistent: true, correlationId: event.correlationId, messageId: event.eventId },
          (err) => (err ? reject(err) : resolve())
        );
      });
      this.emitActivity('BROKER', 'INFO', 'AMQP-Publish', `Published ${event.eventType} (${event.eventId}) -> ${oriConfig.rabbitmq.exchange}`);
      return;
    }

    this.emitActivity('BROKER', 'INFO', 'TopicExchange', `Routed ${event.eventType} (${event.eventId}) [${routingKey}]`);
    const matching = [...this.queues.values()].filter((q) => q.routingKey === routingKey);
    for (const q of matching) {
      if (q.paused) {
        q.buffered.push({ event, attempt: 1 });
        this.emitActivity('BROKER', 'WARN', q.queueName, `Consumer paused — queued ${event.eventId} safely (buffered=${q.buffered.length})`);
      } else {
        void this.deliverInMemory(q, event, 1);
      }
    }
  }

  private async deliverInMemory(q: QueueRegistration, event: EventEnvelope, attempt: number): Promise<void> {
    try {
      await q.handler(event, attempt);
      this.metrics.processed += 1;
    } catch (err) {
      const reason = (err as Error).message;
      if (attempt < oriConfig.rabbitmq.maxRetries) {
        this.metrics.retries += 1;
        this.emitActivity('DLQ', 'WARN', q.queueName, `Retry ${attempt}/${oriConfig.rabbitmq.maxRetries} for ${event.eventId}: ${reason}`);
        await new Promise((r) => setTimeout(r, 15 * attempt));
        return this.deliverInMemory(q, event, attempt + 1);
      }
      this.recordDlq(q.queueName, q.routingKey, event, reason, attempt);
    }
  }

  private recordDlq(queueName: string, routingKey: string, event: EventEnvelope, errorReason: string, retryCount: number): void {
    const entry: DlqEntry = {
      id: `dlq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      queueName,
      exchange: oriConfig.rabbitmq.exchange,
      routingKey,
      event,
      errorReason,
      retryCount,
      maxRetries: oriConfig.rabbitmq.maxRetries,
      rejectedAt: new Date().toISOString(),
      status: 'PENDING_INSPECTION',
    };
    this.dlqStore.unshift(entry);
    this.emitActivity('DLQ', 'ERROR', 'DeadLetterExchange', `Quarantined ${event.eventId} from ${queueName} -> ${oriConfig.rabbitmq.dlq}: ${errorReason}`);
  }

  setBrokerOnline(online: boolean): void {
    this.brokerOnline = online;
    this.emitActivity('BROKER', online ? 'INFO' : 'ERROR', 'BrokerControl', `Broker state set to ${online ? 'ONLINE' : 'OFFLINE'}`);
  }

  isBrokerOnline(): boolean {
    return this.brokerOnline;
  }

  pauseQueue(queueName: string): boolean {
    const q = this.queues.get(queueName);
    if (!q) return false;
    q.paused = true;
    this.emitActivity('BROKER', 'WARN', queueName, 'Consumer paused for fault-tolerance test (TC05)');
    return true;
  }

  async resumeQueue(queueName: string): Promise<number> {
    const q = this.queues.get(queueName);
    if (!q) return 0;
    q.paused = false;
    const pending = q.buffered.splice(0, q.buffered.length);
    this.emitActivity('BROKER', 'INFO', queueName, `Consumer resumed — draining ${pending.length} buffered message(s)`);
    for (const item of pending) {
      await this.deliverInMemory(q, item.event, item.attempt);
    }
    return pending.length;
  }

  async replayDlqMessage(dlqId: string): Promise<boolean> {
    const item = this.dlqStore.find((d) => d.id === dlqId);
    if (!item) return false;
    const q = this.queues.get(item.queueName);
    item.status = 'REPLAYED';
    this.emitActivity('DLQ', 'INFO', 'DLQ-Replay', `Replaying ${item.event.eventId} back to ${item.queueName}`);
    if (q) {
      await this.deliverInMemory(q, item.event, 1);
    }
    return true;
  }

  getDlqMessages(): DlqEntry[] {
    return this.dlqStore;
  }

  clearDlq(): void {
    this.dlqStore = [];
  }

  getStatus() {
    const queueSnapshots = [...this.queues.values()].map((q) => ({
      queueName: q.queueName,
      routingKey: q.routingKey,
      paused: q.paused,
      readyMessages: q.buffered.length,
    }));
    return {
      mode: this.mode,
      online: this.brokerOnline,
      exchange: oriConfig.rabbitmq.exchange,
      dlq: oriConfig.rabbitmq.dlq,
      metrics: { ...this.metrics },
      queues: queueSnapshots,
      pendingDlqCount: this.dlqStore.filter((d) => d.status === 'PENDING_INSPECTION').length,
    };
  }

  resetForTest(): void {
    this.brokerOnline = true;
    this.dlqStore = [];
    this.metrics = { published: 0, processed: 0, retries: 0 };
    for (const q of this.queues.values()) {
      q.paused = false;
      q.buffered = [];
    }
  }

  async close(): Promise<void> {
    if (this.channel) await this.channel.close().catch(() => {});
    if (this.connection) await this.connection.close().catch(() => {});
  }
}

export const eventBus = IntegrationEventBus.getInstance();
