import { Default, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique } from 'typeorm';
import uuid from 'uuid';

@Entity()
@Unique(['one_time_token_id'])
export class OneTimeToken {

	@PrimaryColumn({ length: 36 })
	@Default(uuid.v1())
	one_time_token_id: string = uuid.v1();

	@Column({ length: 36 })
	@Required()
	user_id: string;

	@CreateDateColumn({ type: 'timestamp' })
	@Property()
	created_at: Date;

}

