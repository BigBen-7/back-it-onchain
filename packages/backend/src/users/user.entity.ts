import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

export type ChainType = 'base' | 'stellar';

@Entity()
export class User {
  @PrimaryColumn()
  wallet: string;

  @Column({ type: 'varchar', default: 'base' })
  chain: ChainType;

  @Column({ nullable: true })
  smartAccount: string;

  @Column({ nullable: true })
  displayName: string;

  @Column({ nullable: true, unique: true })
  handle: string;

  @Column({ nullable: true })
  bio: string;

  @Column({ nullable: true })
  avatarCid: string;

  @Column({ nullable: true })
  referredByWallet: string;

  @ManyToOne(() => User, (user) => user.referrals)
  @JoinColumn({ name: 'referredByWallet' })
  referredBy: User;

  @OneToMany(() => User, (user) => user.referredBy)
  referrals: User[];

  @Column({ type: 'int', default: 100 })
  reputationScore: number;

  @CreateDateColumn()
  createdAt: Date;
}
