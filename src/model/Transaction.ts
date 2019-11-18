import { Default, IgnoreProperty, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import uuid from 'uuid';

@Entity()
@Unique(['transaction_id'])
export class Transaction {

    @PrimaryColumn({ length: 36 })
    @Default(uuid.v1())
    transaction_id: string = uuid.v1();

    @Column({ length: 30 })
    @Required()
    amount_transaction: number;

    @Column({ length: 255 })
    @Required()
    transaction_type: string;

    @Column({ length: 36 })
    @Required()
    user_id: string;

    @Column({ length: 36 })
    @Required()
    service_code: string;

    @CreateDateColumn({ type: 'timestamp' })
    @Property()
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    @Property()
    updated_at: Date;

    @Column({ length: 36 })
	deal_id: string;

}
