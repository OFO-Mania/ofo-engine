import { Default, IgnoreProperty, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import uuid from 'uuid';

@Entity()
@Unique(['admin_id'])
@Unique(['email_address'])
export class Administrator {

	@PrimaryColumn({ length: 36 })
	@Default(uuid.v1())
	administrator_id: string = uuid.v1();

	@Column({ length: 255 })
	@Required()
	full_name: string;

	@Column({ length: 255 })
	@Required()
	email_address: string;

	@Column({ length: 255 })
	@Required()
	@IgnoreProperty()
    password: string;

	@CreateDateColumn({ type: 'timestamp' })
	@Property()
	created_at: Date;

	@UpdateDateColumn({ type: 'timestamp' })
	@Property()
	updated_at: Date;

}
