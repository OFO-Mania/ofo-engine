import { Default, IgnoreProperty, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique } from 'typeorm';
import uuid from 'uuid';

@Entity()
@Unique(['balance_history_id'])
export class BalanceHistory {

    @PrimaryColumn({ length: 36 })
    @Default(uuid.v1())
    balance_history_id: string = uuid.v1();

    @Column({ length: 36 })
    @Required()
    user_id: string;

    @Column({ length: 255 })
    @Required()
    type: BalanceType;

    @Column()
    @Required()
    balance: number;

    @CreateDateColumn({ type: 'timestamp' })
    @Property()
    created_at: Date;

}

export enum BalanceType {
	OFO_CASH='OFO_CASH',
	OFO_POINT='OFO_POINT',
}
