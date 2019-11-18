import { Default, IgnoreProperty, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity()
export class Balance_history {

    @Column({ length: 36 })
    @Required()
    user_id: string;

    @Column({ length: 30 })
    @Required()
    balance: number;

    @CreateDateColumn({ type: 'timestamp' })
    @Property()
    created_at: Date;

}
