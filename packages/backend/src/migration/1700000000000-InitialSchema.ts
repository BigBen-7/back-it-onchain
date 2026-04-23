import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * InitialSchema1700000000000
 *
 * Baseline migration — represents the complete schema at the point
 * synchronize: true was disabled. Every subsequent schema change gets
 * its own migration file generated via `npm run typeorm:generate`.
 *
 * Tables created:
 *   calls             — trading call records (core domain)
 *   users             — registered user accounts
 *   audit_logs        — immutable admin action log  (#81)
 *   ip_rules          — firewall whitelist/blacklist (#83)
 *   blocked_requests  — firewall drop log           (#83)
 *
 * CHECK constraints (integrity guardrails):
 *   calls.total_stake_yes  >= 0
 *   calls.total_stake_no   >= 0
 *   calls.end_ts            > calls.start_ts
 *   audit_logs.http_status BETWEEN 100 AND 599
 */
export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Postgres enums ────────────────────────────────────────────────────────

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE audit_action_type_enum AS ENUM (
          'ORACLE_PARAMS_UPDATED',
          'ORACLE_QUORUM_SET',
          'MARKET_MANUALLY_RESOLVED',
          'MARKET_DISPUTED',
          'MARKET_PAUSED',
          'ADMIN_ACTION'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE audit_status_enum AS ENUM (
          'SUCCESS',
          'FAILURE'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE ip_rule_type_enum AS ENUM (
          'WHITELIST',
          'BLACKLIST'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE block_reason_enum AS ENUM (
          'BLACKLISTED_IP',
          'BOT_FINGERPRINT',
          'TURNSTILE_FAILED',
          'RATE_LIMIT_EXCEEDED',
          'MALFORMED_REQUEST'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE call_status_enum AS ENUM (
          'active',
          'resolved',
          'disputed',
          'expired',
          'cancelled'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // ── users ─────────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"            UUID          NOT NULL DEFAULT gen_random_uuid(),
        "wallet_address" VARCHAR(256)  NOT NULL,
        "username"      VARCHAR(128),
        "avatar_url"    TEXT,
        "bio"           TEXT,
        "created_at"    TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ   NOT NULL DEFAULT now(),

        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_wallet_address" UNIQUE ("wallet_address")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_users_wallet_address" ON "users" ("wallet_address");
    `);

    // ── calls ─────────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "calls" (
        "id"                UUID            NOT NULL DEFAULT gen_random_uuid(),
        "call_onchain_id"   VARCHAR(128)    NOT NULL,
        "creator_wallet"    VARCHAR(256)    NOT NULL,
        "stake_token"       VARCHAR(256)    NOT NULL,
        "total_stake_yes"   NUMERIC(36,18)  NOT NULL DEFAULT 0,
        "total_stake_no"    NUMERIC(36,18)  NOT NULL DEFAULT 0,
        "start_ts"          TIMESTAMPTZ     NOT NULL,
        "end_ts"            TIMESTAMPTZ     NOT NULL,
        "token_address"     VARCHAR(256)    NOT NULL,
        "pair_id"           VARCHAR(128),
        "ipfs_cid"          VARCHAR(512),
        "condition_json"    JSONB,
        "status"            call_status_enum NOT NULL DEFAULT 'active',
        "created_at"        TIMESTAMPTZ     NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ     NOT NULL DEFAULT now(),

        CONSTRAINT "PK_calls"                      PRIMARY KEY ("id"),
        CONSTRAINT "UQ_calls_call_onchain_id"      UNIQUE ("call_onchain_id"),

        -- Integrity guardrails: stakes can never go negative
        CONSTRAINT "CHK_calls_total_stake_yes_non_negative"
          CHECK ("total_stake_yes" >= 0),
        CONSTRAINT "CHK_calls_total_stake_no_non_negative"
          CHECK ("total_stake_no" >= 0),

        -- end must be strictly after start
        CONSTRAINT "CHK_calls_end_after_start"
          CHECK ("end_ts" > "start_ts")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_calls_call_onchain_id"  ON "calls" ("call_onchain_id");
      CREATE INDEX "IDX_calls_creator_wallet"   ON "calls" ("creator_wallet");
      CREATE INDEX "IDX_calls_status"           ON "calls" ("status");
      CREATE INDEX "IDX_calls_end_ts"           ON "calls" ("end_ts");
    `);

    // ── audit_logs ────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id"               UUID                   NOT NULL DEFAULT gen_random_uuid(),
        "timestamp"        TIMESTAMPTZ            NOT NULL DEFAULT now(),
        "actor_id"         VARCHAR(256)           NOT NULL,
        "action_type"      audit_action_type_enum NOT NULL,
        "target_resource"  VARCHAR(512)           NOT NULL,
        "request_payload"  JSONB,
        "response_payload" JSONB,
        "http_status"      INTEGER                NOT NULL,
        "status"           audit_status_enum      NOT NULL,
        "note"             TEXT,

        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"),

        -- HTTP status codes are defined in the 100–599 range
        CONSTRAINT "CHK_audit_logs_http_status_range"
          CHECK ("http_status" BETWEEN 100 AND 599)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_timestamp"   ON "audit_logs" ("timestamp");
      CREATE INDEX "IDX_audit_logs_actor_id"    ON "audit_logs" ("actor_id");
      CREATE INDEX "IDX_audit_logs_action_type" ON "audit_logs" ("action_type");
    `);

    // ── ip_rules ──────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ip_rules" (
        "id"          UUID              NOT NULL DEFAULT gen_random_uuid(),
        "cidr"        VARCHAR(64)       NOT NULL,
        "type"        ip_rule_type_enum NOT NULL,
        "reason"      TEXT,
        "created_by"  VARCHAR(256),
        "created_at"  TIMESTAMPTZ       NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ       NOT NULL DEFAULT now(),

        CONSTRAINT "PK_ip_rules"   PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ip_rules_cidr" UNIQUE ("cidr")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ip_rules_cidr" ON "ip_rules" ("cidr");
      CREATE INDEX "IDX_ip_rules_type" ON "ip_rules" ("type");
    `);

    // ── blocked_requests ──────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "blocked_requests" (
        "id"          UUID               NOT NULL DEFAULT gen_random_uuid(),
        "error_code"  VARCHAR(64)        NOT NULL,
        "ip"          VARCHAR(64)        NOT NULL,
        "reason"      block_reason_enum  NOT NULL,
        "method"      VARCHAR(16)        NOT NULL,
        "path"        VARCHAR(1024)      NOT NULL,
        "user_agent"  TEXT,
        "headers"     JSONB,
        "blocked_at"  TIMESTAMPTZ        NOT NULL DEFAULT now(),

        CONSTRAINT "PK_blocked_requests"          PRIMARY KEY ("id"),
        CONSTRAINT "UQ_blocked_requests_error_code" UNIQUE ("error_code")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_blocked_requests_error_code" ON "blocked_requests" ("error_code");
      CREATE INDEX "IDX_blocked_requests_ip"         ON "blocked_requests" ("ip");
      CREATE INDEX "IDX_blocked_requests_reason"     ON "blocked_requests" ("reason");
      CREATE INDEX "IDX_blocked_requests_blocked_at" ON "blocked_requests" ("blocked_at");
    `);
  }

  // ── down — rolls back the entire baseline cleanly ─────────────────────────

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse dependency order
    await queryRunner.query(`DROP TABLE IF EXISTS "blocked_requests" CASCADE;`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "ip_rules"          CASCADE;`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "audit_logs"        CASCADE;`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "calls"             CASCADE;`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "users"             CASCADE;`,
    );

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS block_reason_enum;`);
    await queryRunner.query(`DROP TYPE IF EXISTS ip_rule_type_enum;`);
    await queryRunner.query(`DROP TYPE IF EXISTS audit_status_enum;`);
    await queryRunner.query(`DROP TYPE IF EXISTS audit_action_type_enum;`);
    await queryRunner.query(`DROP TYPE IF EXISTS call_status_enum;`);
  }
}
