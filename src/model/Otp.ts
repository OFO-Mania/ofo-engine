import { Default, IgnoreProperty, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import uuid from 'uuid';

@Entity()
@Unique(['otp_id'])
@Unique(['key'])
export class Otp {

	@PrimaryColumn({ length: 36 })
	@Default(uuid.v1())
	otp_id: string = uuid.v1();

	@Column({ type: 'varchar', length: 255 })
	@Required()
	type: OtpType;

	@Column({ length: 4 })
	@Required()
	key: string;

	@Column({ length: 36 })
	@Required()
	user_id: string;

	@CreateDateColumn({ type: 'timestamp' })
	@Property()
	created_at: Date;

	@UpdateDateColumn({ type: 'timestamp' })
	@Property()
	updated_at: Date;

}

export enum OtpType {
	EMAIL_ADDRESS='EMAIL_ADDRESS',
	PHONE_NUMBER='PHONE_NUMBER',
}
