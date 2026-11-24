import { Request, Response, NextFunction } from 'express';
import { eventBus } from '../shared-core';
import { telemetryService } from './telemetry.service';
import { ceoMetricsService } from './ceo-metrics.service';
import { ORI_SCENARIOS, OriScenarioId, scenarioRunnerService } from './scenario-runner.service';

export class MonitoringController {
  async getTelemetry(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const snapshot = await telemetryService.getSnapshot();
      res.json({ success: true, data: snapshot });
    } catch (err) {
      next(err);
    }
  }

  async getCeoSummary(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const summary = await ceoMetricsService.getExecutiveSummary();
      res.json({ success: true, data: summary });
    } catch (err) {
      next(err);
    }
  }

  streamTelemetry(req: Request, res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    telemetryService.registerSseClient(res);
  }

  getScenarios(_req: Request, res: Response): void {
    res.json({ success: true, data: ORI_SCENARIOS });
  }

  async runScenario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const scenarioId = String(req.params.scenarioId || '') as OriScenarioId;
      const result = await scenarioRunnerService.run(scenarioId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  getDlq(_req: Request, res: Response): void {
    res.json({ success: true, data: eventBus.getDlqMessages() });
  }

  async replayDlq(req: Request, res: Response): Promise<void> {
    const ok = await eventBus.replayDlqMessage(String(req.params.id || ''));
    if (!ok) {
      res.status(404).json({ success: false, message: 'Không tìm thấy DLQ message.' });
      return;
    }
    res.json({ success: true, message: 'Đã replay DLQ message về queue gốc.' });
  }

  clearDlq(_req: Request, res: Response): void {
    eventBus.clearDlq();
    telemetryService.emitLog('DLQ', 'WARN', 'Operator', 'Cleared Dead Letter Queue.');
    res.json({ success: true });
  }
}

export const monitoringController = new MonitoringController();
