import {
  Entity,
  PrimaryColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * UserSettings — 1-to-1 with User.
 *
 * Stores per-user preferences that are separate from identity data:
 *   - notification toggles
 *   - privacy flags
 *   - UI theme preferences
 *
 * A row is auto-created (with sensible defaults) whenever a new User is
 * registered via AuthService.validateUser.
 */
@Entity('user_settings')
export class UserSettings {
  /** Same PK as the owning User row (shared-PK pattern — no surrogate key). */
  @PrimaryColumn()
  wallet: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wallet' })
  user: User;

  // ─── Contact ──────────────────────────────────────────────────────────────

  /** Optional email for off-chain notifications. Never exposed publicly. */
  @Column({ nullable: true, type: 'varchar' })
  emailAddress: string | null;

  // ─── Notification preferences ─────────────────────────────────────────────

  /** Receive email digests / alerts (requires emailAddress to be set). */
  @Column({ default: false })
  receiveEmailNotifs: boolean;

  /** Receive in-app push notifications (web push / mobile). */
  @Column({ default: true })
  receiveInAppNotifs: boolean;

  /** Notify when a call the user created gets staked on. */
  @Column({ default: true })
  notifyOnStake: boolean;

  /** Notify when a call the user created is resolved. */
  @Column({ default: true })
  notifyOnResolution: boolean;

  /** Notify when someone follows the user. */
  @Column({ default: true })
  notifyOnFollow: boolean;

  // ─── Privacy ──────────────────────────────────────────────────────────────

  /** Hide the user's PnL from public leaderboards and profile views. */
  @Column({ default: false })
  showPnlPublicly: boolean;

  /** Make the full profile invisible to non-followers. */
  @Column({ default: false })
  isProfilePrivate: boolean;

  // ─── UI / Display ─────────────────────────────────────────────────────────

  /**
   * Client-side theme preference.
   * Stored here so it persists across devices.
   * Values: 'system' | 'light' | 'dark'
   */
  @Column({ default: 'system', type: 'varchar' })
  theme: 'system' | 'light' | 'dark';

  // ─── Timestamps ───────────────────────────────────────────────────────────

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
