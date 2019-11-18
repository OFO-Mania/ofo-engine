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
    deal_amount: number;

    @Column({ length: 255 })
    @Required()
    deal_image: string;

    @CreateDateColumn({ type: 'timestamp' })
    @Required()
    deal_start : Date;

    @CreateDateColumn({ type: 'timestamp' })
    @Required()
    deal_end : Date;

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
