export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;

export interface QueryResult<Row extends SqlRow = SqlRow> {
  rows: Row[];
  rowCount: number;
}

export interface RunResult {
  rowCount: number;
}

/**
 * Repositories always write portable `?` placeholders. Each adapter is
 * responsible for binding them to its driver-specific statement format.
 */
export interface DatabaseDriver {
  /** Which SQL dialect this driver speaks — the one truth every repository derives its dialect-specific SQL from. */
  readonly dialect: "sqlite" | "postgres";
  query<Row extends SqlRow = SqlRow>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<QueryResult<Row>>;
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>;
  transaction<T>(fn: (transaction: DatabaseDriver) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
