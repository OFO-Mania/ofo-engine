import { Default, IgnoreProperty, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import uuid from 'uuid';

@Entity()
@Unique(['payment_id'])
export class Payment {

    @PrimaryColumn({ length: 36 })
    @Default(uuid.v1())
    payment_id: string = uuid.v1();

    @Column({ length: 255 })
    @Required()
    service: ServiceType;

    @Column({ length: 1024 })
    @Required()
    details: string;
    
    @CreateDateColumn({ type: 'timestamp' })
    @Property()
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    @Property()
    updated_at: Date;
}

export enum ServiceType {
    PLN_POSTPAID='PLN_PREPAID',
    PLN_PREPAID='PLN_PREPAID',
}