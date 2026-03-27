import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { BadgeKey } from './badge-definitions';

@Entity('user_badges')
@Unique(['wallet', 'badge'])
export class UserBadge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  wallet: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wallet', referencedColumnName: 'wallet' })
  user: User;

  @Column({ type: 'enum', enum: BadgeKey })
  badge: BadgeKey;

  @CreateDateColumn()
  grantedAt: Date;
}
