import { Response } from 'express';
import { eventBus, oriConfig } from '../shared-core';
import { orderRepository } from './order.repository';

export type LogChannel = 'BROKER' | 'DLQ' | 'SCENARIO' | 'HEALTH' | 'SECURITY' | 'AI';
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';

export interface TelemetryLogEvent {
  id: string;
  timestamp: string;
  channel: LogChannel;
  level: LogLevel;
  source: string;
  message: string;
}

class CircularRingBuffer<T> {
  private buffer: T[] = [];
  constructor(private readonly capacity = 200) {}

  push(item: T): void {
    if (this.buffer.length >= this.capacity) this.buffer.shift();
    this.buffer.push(item);
  }

  getAll(): T[] {
    return [...this.buffer].reverse();
  }
}

export class OriTelemetryService {
  private static instance: OriTelemetryService | null = null;
  private readonly startTime = Date.now();
  private readonly logBuffer = new CircularRingBuffer<TelemetryLogEvent>(200);
  private readonly sseClients = new Set<Response>();
  private heartbeat: NodeJS.Timeout | null = null;

  private constructor() {
    eventBus.onActivity((entry) => {
      const ch = (['BROKER', 'DLQ', 'SCENARIO', 'HEALTH', 'SECURITY', 'AI'].includes(entry.channel) ? entry.channel : 'BROKER') as LogChannel;
      const lvl = (['INFO', 'WARN', 'ERROR', 'SUCCESS'].includes(entry.level) ? entry.level : 'INFO') as LogLevel;
      this.emitLog(ch, lvl, entry.source, entry.message);
    });
    this.emitLog('HEALTH', 'INFO', 'ORI-Platform', 'SI Monitoring Telemetry Engine online (EventBus + SSE Ready).');
    this.startHeartbeat();
  }

  static getInstance(): OriTelemetryService {
    if (!OriTelemetryService.instance) {
      OriTelemetryService.instance = new OriTelemetryService();
    }
    return OriTelemetryService.instance;
  }

  private startHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(async () => {
      if (this.sseClients.size === 0) return;
      const snapshot = await this.getSnapshot();
      this.broadcast('telemetry:tick', snapshot);
    }, 3000);
    if (this.heartbeat.unref) this.heartbeat.unref();
  }

  emitLog(channel: LogChannel, level: LogLevel, source: string, message: string): TelemetryLogEvent {
    const entry: TelemetryLogEvent = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      channel,
      level,
      source,
      message,
    };
    this.logBuffer.push(entry);
    this.broadcast('log:new', entry);
    return entry;
  }

  registerSseClient(res: Response): void {
    this.sseClients.add(res);
    this.getSnapshot().then((snapshot) => {
      res.write(`event: telemetry:init\ndata: ${JSON.stringify(snapshot)}\n\n`);
    });
    res.on('close', () => this.sseClients.delete(res));
  }

  broadcast(eventType: string, data: unknown): void {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  private async probeService(name: string, role: string, port: number, url: string) {
    const start = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      const body = (await res.json().catch(() => ({}))) as { status?: string };
      return {
        id: `svc-${name}`,
        name,
        role,
        port,
        status: res.ok && body.status !== 'degraded' ? 'HEALTHY' : body.status === 'degraded' ? 'DEGRADED' : 'UNHEALTHY',
        latencyMs: Math.max(1, Date.now() - start),
        uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      };
    } catch {
      return {
        id: `svc-${name}`,
        name,
        role,
        port,
        status: 'UNHEALTHY',
        latencyMs: 999,
        uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      };
    }
  }

  async getSnapshot() {
    const orderDb = await orderRepository.probe();
    const [wms, crm, tms] = await Promise.all([
      this.probeService('wms-system', 'Inventory System API (wms_db)', oriConfig.ports.wms, `${oriConfig.downstream.wmsBaseUrl}/health`),
      this.probeService('crm-system', 'Customer & Loyalty API (crm_db)', oriConfig.ports.crm, `${oriConfig.downstream.crmBaseUrl}/health`),
      this.probeService('tms-system', 'Shipping System API (tms_db)', oriConfig.ports.tms, `${oriConfig.downstream.tmsBaseUrl}/health`),
    ]);

    const containers = [
      {
        id: 'svc-order-process',
        name: 'order-process',
        role: `Orchestrator + AI Mapper (${orderDb.mode})`,
        port: oriConfig.ports.order,
        status: 'HEALTHY',
        latencyMs: orderDb.latencyMs,
        uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      },
      wms,
      crm,
      tms,
    ];

    const brokerStatus = eventBus.getStatus();
    const dlqMessages = eventBus.getDlqMessages();

    return {
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      containers,
      broker: brokerStatus,
      dlq: {
        total: dlqMessages.length,
        pending: dlqMessages.filter((m) => m.status === 'PENDING_INSPECTION').length,
        messages: dlqMessages.slice(0, 15),
      },
      recentLogs: this.logBuffer.getAll().slice(0, 60),
    };
  }
}

export const telemetryService = OriTelemetryService.getInstance();
