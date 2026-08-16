/**
 * Extends and explicitly defines the ambient TypeScript typings for the externally untyped `node-firebird` module.
 * Provides structurally enforced contracts for foundational database connectivity operations.
 */
declare module 'node-firebird' {
  export interface AttachOptions {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    role?: string;
    charset?: string;
    lowercase_keys?: boolean;
  }

  export interface Database {
    query(
      sql: string,
      callback: (error: Error | null, result: unknown[] | undefined) => void,
    ): void;
    query(
      sql: string,
      params: unknown[],
      callback: (error: Error | null, result: unknown[] | undefined) => void,
    ): void;
    detach(callback: (error: Error | null) => void): void;
  }

  export function attach(
    options: AttachOptions,
    callback: (error: Error | null, database: Database) => void,
  ): void;
}
