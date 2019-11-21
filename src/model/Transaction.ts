import { Default, IgnoreProperty, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import uuid from 'uuid';

@Entity()
@Unique(['transaction_id'])
export class Transaction {

    @PrimaryColumn({ length: 36 })
    @Default(uuid.v1())
    transaction_id: string = uuid.v1();

    @Column()
    @Required()
    amount: number;

    @Column({ length: 255 })
    @Required()
    target_type: TargetType;

    @Column({ length: 36 })
    @Required()
    user_id: string;

    @CreateDateColumn({ type: 'timestamp' })
    @Property()
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    @Property()
    updated_at: Date;

    @Column({ length: 255 })
    @Required()
	target_id: string;

    @Column({ length: 36 })
    @Required()
    flow: FlowType;
    
    @Column({ length: 20})
	note: string;
}

export enum FlowType {
    IN_GOING='IN_GOING',
    OUT_GOING='OUT_GOING',
}

export enum TargetType {
    USER='USER',
    BANK='BANK',
    SERVICE='SERVICE',
}