import { Default, IgnoreProperty, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import uuid from 'uuid';

@Entity()
@Unique(['account'])
export class BankAccount {

	@PrimaryColumn({ length: 36 })
	@Default(uuid.v1())
	account_id: string = uuid.v1();

	@Column({ length: 255 })
	@Required()
	name: string;

    @Column({ length: 255 })
	@Required()
	bank: BankType;

	@CreateDateColumn({ type: 'timestamp' })
	@Property()
	created_at: Date;

	@UpdateDateColumn({ type: 'timestamp' })
	@Property()
	updated_at: Date;

}

export enum BankType {
    BCA='BCA'
}