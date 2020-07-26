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

import { Service } from '@tsed/common';
import { TypeORMService } from '@tsed/typeorm';
import { EntityManager, QueryRunner } from 'typeorm';

@Service()
export class DatabaseService {
	private queryRunner: QueryRunner;

	constructor(private typeORMService: TypeORMService) {}

	$afterRoutesInit() {
		this.queryRunner = this.typeORMService.get().createQueryRunner();
	}

	public getManager(): EntityManager {
		return this.queryRunner.manager;
	}

	public async startTransaction(): Promise<void> {
		await this.queryRunner.startTransaction();
	}

	public async commit(): Promise<void> {
		await this.queryRunner.commitTransaction();
	}

	public async rollback(): Promise<void> {
		await this.queryRunner.rollbackTransaction();
	}
}
