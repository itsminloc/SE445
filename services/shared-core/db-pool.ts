import { Pool, PoolClient, QueryResultRow } from 'pg';
import { getPostgresUrl } from './config';

export interface DbProbeResult {
  database: string;
  mode: 'POSTGRES' | 'IN_MEMORY';
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * PostgreSQL logical-DB pool wrapper with graceful fallback detection.
 * Enforces Database-per-Service isolation (order_db, wms_db, crm_db, tms_db).
 */
export class ServiceDbPool {
  private pool: Pool | null = null;
  private pgAvailable: boolean | null = null;

  constructor(private readonly dbName: string) {}

  private ensurePool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: getPostgresUrl(this.dbName),
        connectionTimeoutMillis: 1200,
        idleTimeoutMillis: 10000,
        max: 10,
      });
      this.pool.on('error', () => {
        this.pgAvailable = false;
      });
    }
    return this.pool;
  }

  async initAndCheck(): Promise<boolean> {
    if (process.env.USE_IN_MEMORY_DB === 'true' || process.env.NODE_ENV === 'test') {
      this.pgAvailable = false;
      return false;
    }
    try {
      const pool = this.ensurePool();
      await pool.query('SELECT 1');
      this.pgAvailable = true;
      return true;
    } catch {
      this.pgAvailable = false;
      return false;
    }
  }

  isPostgresActive(): boolean {
    return this.pgAvailable === true;
  }

  async query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]> {
    const pool = this.ensurePool();
    const res = await pool.query<T>(sql, params);
    return res.rows;
  }

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = this.ensurePool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async probe(): Promise<DbProbeResult> {
    const start = Date.now();
    if (this.pgAvailable === false && (process.env.USE_IN_MEMORY_DB === 'true' || process.env.NODE_ENV === 'test')) {
      return { database: this.dbName, mode: 'IN_MEMORY', healthy: true, latencyMs: 1 };
    }
    try {
      await this.ensurePool().query('SELECT 1');
      this.pgAvailable = true;
      return { database: this.dbName, mode: 'POSTGRES', healthy: true, latencyMs: Math.max(1, Date.now() - start) };
    } catch (err) {
      this.pgAvailable = false;
      return {
        database: this.dbName,
        mode: 'IN_MEMORY',
        healthy: true,
        latencyMs: Math.max(1, Date.now() - start),
        error: (err as Error).message,
      };
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
