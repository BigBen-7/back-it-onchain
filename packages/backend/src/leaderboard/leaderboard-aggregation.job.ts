import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Leaderboard, LeaderboardPeriod } from './entities/leaderboard.entity';

interface AggregateRow {
  user_id: string;
  // PostgreSQL returns numeric/int columns as strings in node-postgres
  total_predictions: string;
  win_count: string;
  win_rate: string;
  profit: string;
}

@Injectable()
export class LeaderboardAggregationJob {
  private readonly logger = new Logger(LeaderboardAggregationJob.name);

  constructor(
    @InjectRepository(Leaderboard)
    private readonly leaderboardRepo: Repository<Leaderboard>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Runs daily at midnight and rebuilds both leaderboard periods.
   * Can also be triggered manually for backfilling.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async aggregateAll(): Promise<void> {
    this.logger.log('Leaderboard aggregation started');

    await Promise.all([
      this.aggregatePeriod(LeaderboardPeriod.ALL_TIME),
      this.aggregatePeriod(LeaderboardPeriod.WEEKLY),
    ]);

    this.logger.log('Leaderboard aggregation complete');
  }

  private async aggregatePeriod(period: LeaderboardPeriod): Promise<void> {
    // Only WEEKLY filters by recency — ALL_TIME covers everything resolved
    const periodFilter =
      period === LeaderboardPeriod.WEEKLY
        ? `AND c.end_ts >= NOW() - INTERVAL '7 days'`
        : '';

    // Raw SQL for efficiency on large datasets.
    // "call" must be quoted — it is a reserved word in PostgreSQL 11+.
    // Profit = stakes won from correct calls minus stakes lost on wrong calls.
    const rows: AggregateRow[] = await this.dataSource.query(`
      SELECT
        c.creator_wallet                                                          AS user_id,
        COUNT(*)::int                                                             AS total_predictions,
        COUNT(*) FILTER (WHERE c.outcome = true)::int                            AS win_count,
        CASE WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(
            COUNT(*) FILTER (WHERE c.outcome = true)::numeric
              / COUNT(*)::numeric * 100,
            2
          )
        END                                                                       AS win_rate,
        COALESCE(SUM(c.total_stake_no)  FILTER (WHERE c.outcome = true),  0) -
        COALESCE(SUM(c.total_stake_yes) FILTER (WHERE c.outcome = false), 0)     AS profit
      FROM "call" c
      WHERE c.is_hidden = false
        AND c.status = 'RESOLVED'
        ${periodFilter}
      GROUP BY c.creator_wallet
      ORDER BY win_rate DESC, profit DESC
    `);

    if (rows.length === 0) {
      this.logger.log(`[${period}] No resolved calls found — skipping`);
      return;
    }

    const entries = rows.map((row, index) => {
      const entry = new Leaderboard();
      entry.period = period;
      entry.rank = index + 1;
      entry.userId = row.user_id;
      entry.winRate = parseFloat(row.win_rate);
      entry.profit = parseFloat(row.profit);
      entry.totalPredictions = parseInt(row.total_predictions, 10);
      return entry;
    });

    // Rebuild atomically: wipe stale rankings and insert fresh ones.
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Leaderboard, { period });
      await manager.save(Leaderboard, entries);
    });

    this.logger.log(`[${period}] Rebuilt with ${entries.length} entries`);
  }
}
