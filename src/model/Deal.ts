import { Default, IgnoreProperty, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import uuid from 'uuid';

@Entity()
@Unique(['deal_id'])
export class Deal {

    @PrimaryColumn({ length: 36 })
    @Default(uuid.v1())
    deal_id: string = uuid.v1();

    @Column({ length: 255 })
    @Required()
    description: string;

    @Column({ length: 20 })
    @Required()
    amount: number;

    @Column({ length: 255 })
    @Required()
    image: string;

    @Column({ type: 'timestamp' })
    @Required()
    start_at : Date;

    @Column({ type: 'timestamp' })
    @Required()
    end_at : Date;

    @CreateDateColumn({ type: 'timestamp' })
    @Property()
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    @Property()
    updated_at: Date;

    @Column({ length: 255 })
    @Required()
    service_id: string[];
}
