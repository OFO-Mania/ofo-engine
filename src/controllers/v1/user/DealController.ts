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

import { Controller, Delete, Get, Post, Req, UseAuth } from '@tsed/common';
import { EntityManager } from 'typeorm';
import { UserAuthenticationMiddleware } from '../../../middlewares/UserAuthenticationMiddleware';
import { DatabaseService } from '../../../services/DatabaseService';
import { User, UserType } from '../../../model/User';
import { Deal } from '../../../model/Deal';

@Controller('/deal')
export class DealController {
	private manager: EntityManager;

	constructor(
		private databaseService: DatabaseService,
	) { }

	public $afterRoutesInit(): void {
		this.manager = this.databaseService.getManager();
	}

	@Get('/merchants')
	@UseAuth(UserAuthenticationMiddleware)
	public async getMerchants(@Req() request): Promise<{ merchants: User[] }> {
		return {
			merchants: await this.manager.find(User, {
				type: UserType.MERCHANT,
			})
		};
	}

	@Get('/deals')
	@UseAuth(UserAuthenticationMiddleware)
	public async getDeals(@Req() request: Req): Promise<{ deals: Deal[] }> {
		const merchant: User = <User> (<any>request).user;
		// @ts-ignore
		return {
			deals: await this.manager.find(Deal)
		}
	}

}
