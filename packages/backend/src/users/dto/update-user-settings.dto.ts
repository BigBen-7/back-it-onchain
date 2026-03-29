import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateUserSettingsDto {
  // ─── Contact ────────────────────────────────────────────────────────────────

  /** Optional email for off-chain notifications. Pass null to clear. */
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  emailAddress?: string | null;

  // ─── Notification preferences ───────────────────────────────────────────────

  @IsOptional()
  @IsBoolean()
  receiveEmailNotifs?: boolean;

  @IsOptional()
  @IsBoolean()
  receiveInAppNotifs?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnStake?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnResolution?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnFollow?: boolean;

  // ─── Privacy ────────────────────────────────────────────────────────────────

  @IsOptional()
  @IsBoolean()
  showPnlPublicly?: boolean;

  @IsOptional()
  @IsBoolean()
  isProfilePrivate?: boolean;

  // ─── UI / Display ───────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  @IsIn(['system', 'light', 'dark'])
  theme?: 'system' | 'light' | 'dark';
}
