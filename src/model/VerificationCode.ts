import { Default, IgnoreProperty, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import uuid from 'uuid';

@Entity()
@Unique(['verification_code_id'])
export class VerificationCode {

	@PrimaryColumn({ length: 36 })
	@Default(uuid.v1())
	verification_code_id: string = uuid.v1();

	@Column({ type: 'varchar', length: 255 })
	@Required()
	type: VerificationCodeType;

	@Column({ length: 4 })
	@Required()
	value: string;

	@Column({ length: 36 })
	@Required()
	user_id: string;

	@CreateDateColumn({ type: 'timestamp' })
	@Property()
	created_at: Date;

}

export enum VerificationCodeType {
	EMAIL_ADDRESS='EMAIL_ADDRESS',
	PHONE_NUMBER='PHONE_NUMBER',
}
