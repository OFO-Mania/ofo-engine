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

import { Err, GlobalErrorHandlerMiddleware, IMiddleware, OverrideProvider, Req, Res } from '@tsed/common';
import { Exception } from 'ts-httpexceptions';
import { $log } from 'ts-log-debug';

@OverrideProvider(GlobalErrorHandlerMiddleware)
export class ErrorHandlerMiddleware extends GlobalErrorHandlerMiddleware implements IMiddleware {

	public use(@Err() error: any, @Req() request: Req, @Res() response: Res): void {
		if (response.headersSent) {
			throw error;
		}
		const craftErrorObject = (message: string, code: number) => ({
			success: false,
			code,
			message,
		});
		if (error instanceof Exception) {
			$log.error('' + error);
			response.status(error.status)
				.json(craftErrorObject(error.message, error.status));
			return;
		}

		if (typeof error === 'string') {
			response.status(500)
				.json(craftErrorObject(error, 500));
			return;
		}

		$log.error('' + error);
		response.status(error.status || 500)
			.json(craftErrorObject(error.message, error.status || 500));
		return;
	}

}
