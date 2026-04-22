import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('participants')
@Index('IDX_participant_call_wallet', ['callId', 'wallet'])
export class Participant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  callId: string;

  @Column()
  wallet: string;

  @Column('decimal', { precision: 36, scale: 18, default: 0 })
  amount: number;

  @Column({ default: true })
  position: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
