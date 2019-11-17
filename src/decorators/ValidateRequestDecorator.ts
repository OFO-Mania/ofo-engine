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

import { Next, Req, Res, UseBefore } from '@tsed/common';
import { applyDecorators, isString } from '@tsed/core';
import { BadRequest } from 'ts-httpexceptions';

export function ValidateRequest(requirements: RequestRequirements): Function {
	return applyDecorators(
		UseBefore((request: Req, response: Res, next: Next) => {
			if (Array.isArray(requirements.query)) {
				for (const field of requirements.query) {
					if (typeof request.query[field] === 'undefined' || request.query[field] === null || request.query[field] === '') {
						throw new BadRequest('Required query "' + field + '" is not satisfied.');
					}
				}
			}
			if (Array.isArray(requirements.body)) {
				for (const field of requirements.body) {
					if (typeof request.body[field] === 'undefined' || request.body[field] === null || request.body[field] === '') {
						throw new BadRequest('Required body "' + field + '" is not satisfied.');
					}
				}
			}
			if (isString(requirements.file)) {
				const files = request.files;
				const field = requirements.file;
				if (!files || !files[requirements.file]) {
					throw new BadRequest('Required file "' + field + '" is not satisfied.');
				}
			}
			if (Array.isArray(requirements.files)) {
				const files = request.files;
				if (!files) {
					const field = requirements.files[0];
					throw new BadRequest('Required file "' + field + '" is not satisfied.');
				}
				for (const field of requirements.files) {
					if (!files[field]) {
						throw new BadRequest('Required file "' + field + '" is not satisfied.');
					}
				}
			}
			if (requirements.useTrim === true) {
				for (const field in request.query) {
					if (
						request.query.hasOwnProperty(field) &&
						typeof request.query[field].trim === 'function'
					) {
						request.query[field] = request.query[field].trim();
					}
				}
				for (const field in request.body) {
					if (
						request.body.hasOwnProperty(field) &&
						typeof request.body[field].trim === 'function'
					) {
						request.body[field] = request.body[field].trim();
					}
				}
			}
			next();
		})
	);
}

export type RequestRequirements = {
	body?: string[];
	query?: string[];
	file?: string;
	files?: string[];
	useTrim?: boolean;
};
