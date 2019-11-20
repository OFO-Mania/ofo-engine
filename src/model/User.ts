/**
 * Copyright 2019, The OFO Mania Team.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Default, IgnoreProperty, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import uuid from 'uuid';

export enum UserType {
    MERCHANT = 'MERCHANT',
    USER = 'USER',
}

@Entity()
@Unique(['user_id'])
export class User {

	@PrimaryColumn({ length: 36 })
	@Default(uuid.v1())
	user_id: string = uuid.v1();

	@Column({ length: 255 })
	@Required()
	full_name: string;

	@Column({ length: 15 })
	@Required()
	phone_number: string;

	@Column({ length: 255 })
	@Required()
	email_address: string;

	@Column({ length: 255, nullable: true })
	referral_code: string;

	@Column()
	@Required()
	@Default(false)
	has_security_code: boolean = false;

	@Column({ length: 255 })
	@Required()
	@Default('')
	@IgnoreProperty()
	security_code: string = '';

	@Column()
	@Required()
	@Default(false)
	is_verified: boolean = false;

	@Column({ length: 255, nullable: true })
	image: string;

	@Column({ length: 255 })
	@Required()
	@Default(UserType.USER)
	type: UserType = UserType.USER;

	@Column()
	@Required()
	@Default(0)
	current_balance: number = 0;

	@CreateDateColumn({ type: 'timestamp' })
	@Property()
	created_at: Date;

	@UpdateDateColumn({ type: 'timestamp' })
	@Property()
	updated_at: Date;

}
