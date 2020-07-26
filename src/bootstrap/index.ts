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

import { $log } from '@tsed/common';
import { PlatformExpress } from '@tsed/platform-express';
import { Server } from '../Server';

const config = require('dotenv').config();

async function bootstrap() {
	try {
		$log.debug('Starting server...');
		const platform = await PlatformExpress.bootstrap(Server, config);
		await platform.listen();
		$log.debug('Server initialised.');
	} catch (error) {
		$log.error(error);
	}
}

bootstrap().then();
