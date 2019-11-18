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
	merchant_name: string;

	@Column({ length: 15 })
	@Required()
	merchant_phone: string;

	@Column({ length: 255 })
	@Required()
	merchant_email: string;

	@CreateDateColumn({ type: 'timestamp' })
	@Property()
	created_at: Date;

	@UpdateDateColumn({ type: 'timestamp' })
	@Property()
	updated_at: Date;

}
