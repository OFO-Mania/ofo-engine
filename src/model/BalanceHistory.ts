import { Default, IgnoreProperty, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique } from 'typeorm';
import uuid from 'uuid';

@Entity()
@Unique(['balance_id'])
export class BalanceHistory {

    @PrimaryColumn({ length: 36 })
    @Default(uuid.v1())
    balance_id: string = uuid.v1();

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
