import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delete_events')
export class DeleteEventEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  source: string;

  @Column({ nullable: true })
  entity: string;

  @Column({ nullable: true })
  action: string;

  @Column({ nullable: true })
  title: string;

  // se arregló: faltaba la columna description en delete_events
  @Column({ nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  payload: string;

  @Column({ nullable: true })
  createdAt: string;
}
