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

import { isArray, isString } from '@tsed/core';
import { ServerLoader, ServerSettings, Req, Res, Next } from '@tsed/common';
import '@tsed/typeorm';
import '@tsed/swagger';
import '@tsed/ajv';
import '@tsed/multipartfiles';

import fs from 'fs';
import Path from 'path';
import { ejs } from 'consolidate';
import * as Sentry from '@sentry/node';
import helmet from 'helmet';
import cors from 'cors';
import compress from 'compression';
import methodOverride from 'method-override';
import { json, urlencoded } from 'body-parser';
import favicon from 'express-favicon';
import SendGridMail from '@sendgrid/mail';

import { DatabaseConfig } from './config/database.config';
import { MonitoringConfig } from './config/monitoring.config';
import { MailConfig } from './config/mail.config';
import { ServerConfig } from './config/server.config';
import { NotFoundMiddleware } from './middlewares/NotFoundMiddleware';
import { ResponseMiddleware } from './middlewares/ResponseMiddleware';
import { ErrorHandlerMiddleware } from './middlewares/ErrorHandlerMiddleware';

const rootDir = Path.resolve(__dirname);

@ServerSettings({
	rootDir,
	httpPort: ServerConfig.address + ':' + (+ServerConfig.port + 1),
	httpsPort: ServerConfig.address + ':' + ServerConfig.port,
	httpsOptions: {
		key: fs.readFileSync(Path.join(__dirname, '..', 'keys', 'server.key')),
		cert: fs.readFileSync(Path.join(__dirname, '..', 'keys', 'server.cert'))
	},
	viewsDir: `${rootDir}/views`,
	mount: {
		'/': `${rootDir}/controllers/*{.ts,.js}`,
		'/v1': `${rootDir}/controllers/v1/**/*{.ts,.js}`,
	},
	uploadDir: `${rootDir}/../data`,
	typeorm: [
		{
			name: 'default',
			type: <any>DatabaseConfig.type,
			host: DatabaseConfig.host,
			port: DatabaseConfig.port,
			username: DatabaseConfig.username,
			password: DatabaseConfig.password,
			database: DatabaseConfig.name,
			synchronize: true,
			logging: false,
			entities: [
				`${rootDir}/model/*{.ts,.js}`
			],
			migrations: [
				`${rootDir}/migrations/*{.ts,.js}`
			],
			subscribers: [
				`${rootDir}/subscriber/*{.ts,.js}`
			]
		}
	],
	swagger: [{
		path: '/docs',
		doc: 'api-v1',
	}],
	ajv: {
		errorFormat: (error) => `Parameter "${error.dataPath.substr(1)}" ${error.message}.`,
	},
})
export class Server extends ServerLoader {

	public $beforeInit(): void {
		this.set('trust proxy', 1);
		this.set('views', this.settings.get('viewsDir'));
		this.engine('ejs', ejs);
		Sentry.init({
			dsn: MonitoringConfig.sentryDSN
		});
		SendGridMail.setApiKey(MailConfig.sendGridKey);
	}

	public $beforeRoutesInit(): void {
		this
			.use(Sentry.Handlers.requestHandler())
			.use(helmet())
			.use(cors({
				allowedHeaders: [
					'Accept',
					'Authorization',
					'Content-Type',
					'Use-Token',
					'X-HTTP-Method-Override',
					'X-Requested-With',
				],
				methods: [ 'GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'UPDATE', 'OPTIONS' ],
				origin: true,
			}))
			.use(compress({}))
			.use(methodOverride())
			.use(json())
			.use(urlencoded({
				extended: true
			}))
			.use(favicon(Path.join(__dirname, 'views', 'favicon.ico')));
	}

	public $afterRoutesInit(): void {
		this.use(NotFoundMiddleware)
			.use(ResponseMiddleware)
			.use(Sentry.Handlers.errorHandler())
			.use(ErrorHandlerMiddleware)
	}

}
