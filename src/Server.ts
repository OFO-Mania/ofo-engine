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

import { Configuration, Inject, PlatformApplication } from '@tsed/common';
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
import { ServerOptions } from 'https';

const rootDir = Path.resolve(__dirname);
const httpPort = ServerConfig.address + ':' + ServerConfig.port;
const httpsPort = ServerConfig.httpsEnable ? ServerConfig.address + ':' + (parseInt(ServerConfig.port) + 1) : false;
const httpsOptionsFunc = function () {
	if (ServerConfig.httpsEnable) {
		return <ServerOptions>{
			key: fs.readFileSync(Path.join(__dirname, '..', 'keys', 'server.key')),
			cert: fs.readFileSync(Path.join(__dirname, '..', 'keys', 'server.crt')),
		};
	}
};

@Configuration({
	rootDir,
	httpPort,
	httpsPort,
	httpsOptions: httpsOptionsFunc(),
	viewsDir: `${rootDir}/views`,
	mount: {
		'/api/': `${rootDir}/controllers/*{.ts,.js}`,
		'/api/v1': `${rootDir}/controllers/v1/**/*{.ts,.js}`,
	},
	statics: {
		'/static': `${rootDir}/../ugc`,
		'/merchant': `${rootDir}/../../ofo-panel/public`,
	},
	uploadDir: `${rootDir}/../ugc`,
	typeorm: [
		{
			name: 'default',
			type: <any>DatabaseConfig.type,
			host: DatabaseConfig.host,
			port: DatabaseConfig.port,
			username: DatabaseConfig.username,
			password: DatabaseConfig.password,
			database: DatabaseConfig.name,
			connectTimeout: 20000,
			acquireTimeout: 20000,
			synchronize: true,
			logging: false,
			entities: [`${rootDir}/model/*{.ts,.js}`],
			migrations: [`${rootDir}/migrations/*{.ts,.js}`],
			subscribers: [`${rootDir}/subscriber/*{.ts,.js}`],
		},
	],
	swagger: [
		{
			path: '/docs',
			doc: 'api-v1',
		},
	],
	ajv: {
		errorFormat: (error) => `Parameter "${error.dataPath.substr(1)}" ${error.message}.`,
	},
})
export class Server {
	@Inject()
	app: PlatformApplication;

	@Configuration()
	settings: Configuration;

	public $beforeInit(): void {
		// this.app.set('trust proxy', 1)
		// 	.set('views', this.settings.get('viewsDir'))
		// 	.engine('ejs', ejs);
		if (MonitoringConfig.enable) {
			Sentry.init({
				dsn: MonitoringConfig.sentryDSN,
			});
		}
		if (MailConfig.enable) {
			SendGridMail.setApiKey(MailConfig.sendGridKey);
		}
	}

	/**
	 * This method let you configure the express middleware required by your application to works.
	 * @returns {Server}
	 */
	public $beforeRoutesInit(): void {
		if (MonitoringConfig.enable) {
			this.app.use(Sentry.Handlers.requestHandler());
		}
		this.app
			.use(helmet())
			.use(
				cors({
					allowedHeaders: [
						'Accept',
						'Authorization',
						'Content-Type',
						'Use-Token',
						'X-HTTP-Method-Override',
						'X-Requested-With',
					],
					methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'UPDATE', 'OPTIONS'],
					origin: true,
				})
			)
			.use(compress({}))
			.use(methodOverride())
			.use(json())
			.use(
				urlencoded({
					extended: true,
				})
			)
			.use(favicon(Path.join(__dirname, 'views', 'favicon.ico')));
	}

	public $afterRoutesInit(): void {
		this.app.use(NotFoundMiddleware).use(ResponseMiddleware);
		if (MonitoringConfig.enable) {
			this.app.use(Sentry.Handlers.errorHandler());
		}
		this.app.use(ErrorHandlerMiddleware);
	}
}
