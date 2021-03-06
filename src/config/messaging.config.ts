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

require('dotenv').config();

export const MessagingConfig = {
	twilio: {
		enable: process.env.TWILIO_ENABLE == 'true' || false,
		accountServiceID: process.env.TWILIO_ACCOUNT_SERVICE_ID,
		authToken: process.env.TWILIO_AUTH_TOKEN,
		messagingServiceID: process.env.TWILIO_MESSAGING_SERVICE_ID,
	},
};
