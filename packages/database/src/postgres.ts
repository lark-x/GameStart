import type { SqlClient, SqlQueryResult, SqlRow } from "./sql.ts";

export interface PostgresQueryExecutor {
  query<Row extends SqlRow = SqlRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: readonly Row[] }>;
}

export interface PostgresPoolLike extends PostgresQueryExecutor {
  end?(): Promise<void>;
  connect?(): Promise<PostgresConnectionLike>;
}

export interface PostgresConnectionLike extends PostgresQueryExecutor {
  release(): void;
}

/** Adapts the pg Pool surface to the repository SQL boundary. */
export class PostgresSqlClient implements SqlClient {
  private readonly pool: PostgresPoolLike;

  public constructor(pool: PostgresPoolLike) {
    this.pool = pool;
  }

  public query<Row extends SqlRow = SqlRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>> {
    return this.pool.query<Row>(text, values);
  }

  public async close(): Promise<void> {
    await this.pool.end?.();
  }

  public async transaction<T>(operation: (client: SqlClient) => Promise<T>): Promise<T> {
    if (this.pool.connect === undefined) {
      throw new Error("PostgreSQL pool does not support transactions");
    }
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      const result = await operation(connection);
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }
}

export interface PostgresSqlClientOptions {
  readonly connectionString: string;
  readonly max?: number;
  readonly idleTimeoutMillis?: number;
}

/**
 * Lazily loads the optional pg driver so domain and in-memory tests remain
 * dependency-free. Calling this factory is the explicit production boundary.
 */
export async function createPostgresSqlClient(
  options: PostgresSqlClientOptions,
): Promise<PostgresSqlClient> {
  if (options.connectionString.trim().length === 0) {
    throw new TypeError("PostgreSQL connectionString must not be empty");
  }
  const module = await import("pg");
  const Pool = module.Pool ?? (module as unknown as {
    default?: { Pool?: new (config: {
      connectionString: string;
      max?: number;
      idleTimeoutMillis?: number;
    }) => PostgresPoolLike;
  }}).default?.Pool;
  if (Pool === undefined) throw new Error("pg driver does not expose a Pool constructor");
  const pool = new Pool({
    connectionString: options.connectionString,
    ...(options.max === undefined ? {} : { max: options.max }),
    ...(options.idleTimeoutMillis === undefined ? {} : { idleTimeoutMillis: options.idleTimeoutMillis }),
  });
  return new PostgresSqlClient(pool);
}
