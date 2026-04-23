/**
 * data-source.ts
 *
 * The canonical TypeORM DataSource used by:
 *   1. The TypeORM CLI  (typeorm:generate, typeorm:run, typeorm:revert)
 *   2. AppModule at runtime via TypeOrmModule.forRootAsync()
 *
 * Having one file eliminates config drift between the CLI and the app.
 *
 * Usage:
 *   npx typeorm-ts-node-commonjs -d src/data-source.ts migration:run
 *   (or use the npm scripts defined in package.json)
 */

import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env before anything else so process.env is populated for the CLI
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',

  // ── Connection ────────────────────────────────────────────────────────────
  host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(
    process.env.DB_PORT || process.env.POSTGRES_PORT || '5432',
    10,
  ),
  username: process.env.DB_USERNAME || process.env.POSTGRES_USER || 'postgres',
  password:
    process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.DB_NAME || process.env.POSTGRES_DB || 'backit',

  // ── Schema management ─────────────────────────────────────────────────────
  // synchronize is ALWAYS false here — migrations are the only way schema changes.
  synchronize: false,
  migrationsRun: false, // run explicitly via CLI or startup hook, never silently

  // ── Entity discovery ──────────────────────────────────────────────────────
  // Glob picks up every *.entity.ts in the src tree, so new entities are
  // automatically included without touching this file.
  entities: [path.join(__dirname, '**', '*.entity.{ts,js}')],

  // ── Migrations ────────────────────────────────────────────────────────────
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations', // explicit name prevents accidental conflicts

  // ── Logging ───────────────────────────────────────────────────────────────
  // Log all queries in development; only errors in production.
  logging:
    process.env.NODE_ENV === 'production'
      ? ['error']
      : ['error', 'warn', 'schema'],
};

/**
 * Default export — required by the TypeORM CLI (`-d src/data-source.ts`).
 */
const AppDataSource = new DataSource(dataSourceOptions);
export default AppDataSource;
