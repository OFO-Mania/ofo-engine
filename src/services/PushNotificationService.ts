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

import axios, { AxiosResponse } from 'axios';
import { Service } from '@tsed/common';
import { PushNotificationConfig } from '../config/pushnotification.config';

@Service()
export class PushNotificationService {
	constructor() {}

	public sendNotification(notification: {
		title: string, message: string, image?: string
	}, deviceID?: string)
		: Promise<AxiosResponse<INotificationResponse>> {
		const data = {
			app_id:  PushNotificationConfig.onesignal.applicationIdentifier,
			headings: {
				en: notification.title
			},
			contents: {
				en: notification.message
			},
			big_picture: notification.image,
			included_segments: deviceID ? [deviceID] : ['All'],
			include_player_ids: deviceID ? [ deviceID ] : deviceID
		};
		const client = axios.create({
			baseURL: 'https://onesignal.com',
			headers: {
				Authorization: `Basic ${PushNotificationConfig.onesignal.apiKey}`,
				'Content-Type': 'application/json; charset=utf-8'
			}
		});
		return client.post<INotificationResponse>('/api/v1/notifications', data);
	}

}

export interface INotificationResponse {
	id: string
	players: string[]
	messageable_players: string[]
}
