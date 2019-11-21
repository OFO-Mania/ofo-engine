import { Default, IgnoreProperty, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import uuid from 'uuid';

@Entity()
@Unique(['transaction_id'])
export class Transaction {

    @PrimaryColumn({ length: 36 })
    @Default(uuid.v1())
    transaction_id: string = uuid.v1();

    @Column({ length: 36 })
    @Required()
    user_id: string;

    @Column()
    @Required()
    amount: number;

    @Column()
    @Required()
    @Default(0)
    fee: number = 0;

    @Column({ length: 255 })
    @Required()
    target_type: TargetType;

    @Column({ length: 255 })
    @Required()
    wallet_type: WalletType;

    @Column({ length: 255 })
    @Required()
	target_id: string;

    @Column({ length: 36 })
    @Required()
    flow: FlowType;
    
    @Column({ length: 20})
    note: string;
    
    @CreateDateColumn({ type: 'timestamp' })
    @Property()
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    @Property()
    updated_at: Date;
}

export enum FlowType {
    INCOMING='INCOMING',
    OUTGOING='OUTGOING',
}

export enum TargetType {
    USER='USER',
    BANK='BANK',
    PAYMENT='PAYMENT',
}

export enum WalletType {
    CASH='CASH',
    POINT='POINT',
}