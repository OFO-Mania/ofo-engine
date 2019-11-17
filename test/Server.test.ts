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

import { expect } from 'chai';
import { agent as request } from 'supertest';

import { Server } from '../src/Server';

it('should GET /', async function () {
	const response = await request(Server)
		.get('/');
	expect(response.status).to.equal(404);
	expect(response.body).not.to.be.empty;
	expect(response.body.success).not.to.be.empty;
	expect(response.body.code).not.to.be.empty;
	expect(response.body.code).to.equal(404);
	expect(response.body.message).not.to.be.empty;
	expect(response.body.data).to.be.empty;
});
