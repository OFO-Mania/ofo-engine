/**
 * Copyright 2019, Danang Galuh Tegar Prasetyo.
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

import { IMiddleware, Middleware, Req, Res } from '@tsed/common';
import { BadRequest, Forbidden, Unauthorized } from 'ts-httpexceptions';
import jwt from 'jsonwebtoken';
import { PassportConfig } from '../config/passport.config';
import { EntityManager } from 'typeorm';
import { DatabaseService } from '../services/DatabaseService';
import { User, UserType } from '../model/User';

@Middleware()
export class UserAuthenticationMiddleware implements IMiddleware {

	private manager: EntityManager;

	constructor(private databaseService: DatabaseService) {}

	public $afterRoutesInit(): void {
		this.manager = this.databaseService.getManager();
	}

	public async use(
		@Req() request: Req,
		@Res() response: Res
	): Promise<void> {
		const requestToken = request.headers['authorization'] ||
			request.headers['x-access-token'];
		if (!requestToken) {
			throw new Unauthorized('Authentication needed to access this resource.');
		}
		const tokenString = Array.isArray(requestToken)
			? requestToken[0]
			: String(requestToken);
		const token = tokenString.startsWith('Bearer ')
			? tokenString.slice(7, tokenString.length)
			: tokenString;
		try {
			const payload = jwt.verify(token, PassportConfig.jwt.secret);
			if (typeof payload === 'string') {
				const user = await this.manager.findOne(User, {
					user_id: payload,
					type: UserType.USER
				});
				if (typeof user === 'undefined') {
					throw new BadRequest('Authentication token is invalid.');
				}
				if (!user.is_verified) {
					throw new Forbidden('Account has not been verified.')
				}
				// User Authenticated
				(<any>request).user = user;
				(<any>response).user = user;
			}
		} catch (error) {
			if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
				error.message = `Authentication failed. The token you provided could not be proven authentic. [${error.name}|${error.message}]`
			}
			if (error.name === 'TokenExpiredError') {
				error.message = `Your session has been expired. Please sign in again. [${error.name}|${error.message}]`;
			}
			throw new Unauthorized(error.message);
		}
		if (!(<any>request).user) {
			throw new Unauthorized('You are not authenticated to access this resource.');
		}
	}

}
