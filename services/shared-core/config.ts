import 'dotenv/config';

export interface OriConfig {
  env: 'development' | 'production' | 'test';
  logLevel: string;
  ports: {
    wms: number;
    crm: number;
    tms: number;
    order: number;
  };
  postgres: {
    host: string;
    port: number;
    user: string;
    password: string;
  };
  rabbitmq: {
    url: string;
    exchange: string;
    dlx: string;
    dlq: string;
    maxRetries: number;
  };
  downstream: {
    wmsBaseUrl: string;
    crmBaseUrl: string;
    tmsBaseUrl: string;
  };
  security: {
    jwtSecret: string;
    jwtExpiresIn: string;
    rateLimitPerMin: number;
  };
  ai: {
    geminiApiKey: string;
    geminiModel: string;
  };
}

export const oriConfig: OriConfig = {
  env: (process.env.NODE_ENV as OriConfig['env']) || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  ports: {
    wms: parseInt(process.env.WMS_PORT || '3001', 10),
    crm: parseInt(process.env.CRM_PORT || '3002', 10),
    tms: parseInt(process.env.TMS_PORT || '3003', 10),
    order: parseInt(process.env.ORDER_PORT || '3004', 10),
  },
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'caseuser',
    password: process.env.POSTGRES_PASSWORD || 'casepass_local_change_me',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://caseuser:casepass_local_change_me@localhost:5672',
    exchange: 'retail.events',
    dlx: 'retail.dlx',
    dlq: 'retail.dlq',
    maxRetries: 3,
  },
  downstream: {
    wmsBaseUrl: process.env.WMS_BASE_URL || `http://localhost:${process.env.WMS_PORT || '3001'}`,
    crmBaseUrl: process.env.CRM_BASE_URL || `http://localhost:${process.env.CRM_PORT || '3002'}`,
    tmsBaseUrl: process.env.TMS_BASE_URL || `http://localhost:${process.env.TMS_PORT || '3003'}`,
  },
  security: {
    jwtSecret: process.env.JWT_SECRET || 'ori-dev-jwt-secret-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    rateLimitPerMin: parseInt(process.env.RATE_LIMIT_MAX_PER_MIN || '100', 10),
  },
  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  },
};

export function getPostgresUrl(dbName: string): string {
  const { user, password, host, port } = oriConfig.postgres;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${dbName}`;
}
