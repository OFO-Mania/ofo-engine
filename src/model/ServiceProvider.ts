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

@Entity()
@Unique(['serviceprovider_id'])
export class ServiceProvider {

	@PrimaryColumn({ length: 36 })
	@Default(uuid.v1())
	serviceprovider_id: string = uuid.v1();

	@Column({ length: 255 })
	@Required()
	name: string;

	@CreateDateColumn({ type: 'timestamp' })
	@Property()
	created_at: Date;

	@UpdateDateColumn({ type: 'timestamp' })
	@Property()
	updated_at: Date;

}
