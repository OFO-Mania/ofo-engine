import { Default, IgnoreProperty, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import uuid from 'uuid';

@Entity()
@Unique(['merchant_id'])
@Unique(['merchant_email'])
export class Merchant {

	@PrimaryColumn({ length: 36 })
	@Default(uuid.v1())
	merchant_id: string = uuid.v1();

	@Column({ length: 255 })
	@Required()
	name: string;

	@Column({ length: 15 })
	@Required()
	phone_number: string;

	@Column({ length: 255 })
	@Required()
	email_address: string;

	@CreateDateColumn({ type: 'timestamp' })
	@Property()
	created_at: Date;

	@UpdateDateColumn({ type: 'timestamp' })
	@Property()
	updated_at: Date;

}
