import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddBTreeIndexesAndParticipants1745358977000
 *
 * Resolves issue #91: B-Tree Indexing applied to high-traffic columns.
 *
 * Changes:
 *   - Adds indexes on calls(status), calls(end_ts), calls(creator_wallet)
 *   - Creates participants table with compound index on (call_id, wallet)
 */
export class AddBTreeIndexesAndParticipants1745358977000
  implements MigrationInterface
{
  name = 'AddBTreeIndexesAndParticipants1745358977000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Indexes on calls — skip if already present from initial migration
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_call_status"
        ON "call" ("status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_call_end_ts"
        ON "call" ("endTs");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_call_creator_wallet"
        ON "call" ("creatorWallet");
    `);

    // Participants table with compound unique-check index
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "participants" (
        "id"         UUID            NOT NULL DEFAULT gen_random_uuid(),
        "callId"     VARCHAR(256)    NOT NULL,
        "wallet"     VARCHAR(256)    NOT NULL,
        "amount"     NUMERIC(36,18)  NOT NULL DEFAULT 0,
        "position"   BOOLEAN         NOT NULL DEFAULT true,
        "createdAt"  TIMESTAMPTZ     NOT NULL DEFAULT now(),

        CONSTRAINT "PK_participants" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_participant_call_wallet"
        ON "participants" ("callId", "wallet");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_participant_call_wallet";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "participants";`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_call_creator_wallet";`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_call_end_ts";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_call_status";`);
  }
}
