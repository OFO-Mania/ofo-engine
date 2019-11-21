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

import { Controller, Post, Req, Res } from '@tsed/common';
import { Docs } from '@tsed/swagger';
import { BadRequest } from 'ts-httpexceptions';
import { EntityManager } from 'typeorm';
import argon2 from 'argon2';
import twilio from 'twilio';
import SendGridMail from '@sendgrid/mail';
import jwt from 'jsonwebtoken';

import { MessagingConfig } from '../config/messaging.config';
import { PassportConfig } from '../config/passport.config';
import { ValidateRequest } from '../decorators/ValidateRequestDecorator';
import { DatabaseService } from '../services/DatabaseService';
import { User, UserType } from '../model/User';
import { VerificationCode, VerificationCodeType } from '../model/VerificationCode';
import { OneTimeToken } from '../model/OneTimeToken';

@Controller('/auth/merchant')
@Docs('api-v1')
export class MerchantAuthenticationController {

	private manager: EntityManager;

	constructor(private databaseService: DatabaseService) {}

	private static generateVerificationCode(): string {
		const availableCharacters = '0123456789';
		const otp = [];
		for (let i = 0; i < 4; i++) {
			otp.push(
				availableCharacters.charAt(
					Math.floor(
						Math.random() * availableCharacters.length
					)
				)
			);
		}
		return otp.join('');
	}

	public $afterRoutesInit(): void {
		this.manager = this.databaseService.getManager();
	}

	@Post('/join')
	@ValidateRequest({
		body: ['full_name', 'phone_number', 'email_address', 'security_code'],
		useTrim: true
	})
	public async join(@Req() request: Req, @Res() response: Res): Promise<{ user: User }> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				full_name: request.body.full_name,
				phone_number: request.body.phone_number,
				email_address: request.body.email_address,
				security_code: request.body.security_code
			};
			const emailRegExp = new RegExp(
				/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
			);
			if (!emailRegExp.test(body.email_address)) {
				throw new BadRequest(`Email address ${body.email_address} is not a valid email address.`)
			}
			let user = await this.manager.findOne(User, {
				email_address: body.email_address,
				type: UserType.MERCHANT
			});
			if (typeof user !== 'undefined') {
				if (user.is_verified) {
					throw new BadRequest(`Email address ${body.email_address} has already registered.`);
				} else {
					await this.manager.remove(user);
				}
			}
			if (body.phone_number.startsWith('0')) {
				body.phone_number = '62'.concat(body.phone_number.substring(1));
			}
			if (body.phone_number.startsWith('62')) {
				body.phone_number = '+'.concat(body.phone_number);
			}
			user = await this.manager.findOne(User, {
				phone_number: body.phone_number,
				type: UserType.MERCHANT
			});
			if (typeof user !== 'undefined') {
				if (user.is_verified) {
					throw new BadRequest(`Phone number ${body.phone_number} has already registered.`);
				} else {
					await this.manager.remove(user);
				}
			}
			user = new User();
			user.full_name = body.full_name;
			user.phone_number = body.phone_number;
			user.email_address = body.email_address;
			user.has_security_code = true;
			user.security_code = await argon2.hash(body.security_code);
			user = await this.manager.save(user);
			await this.databaseService.commit();
			return { user };
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}

	@Post('/phone_verification/send')
	@ValidateRequest({
		body: ['phone_number'],
		useTrim: true
	})
	public async sendPhoneVerification(@Req() request: Req, @Res() response: Res): Promise<string> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				phone_number: request.body.phone_number,
			};
			if (body.phone_number.startsWith('0')) {
				body.phone_number = '62'.concat(body.phone_number.substring(1));
			}
			if (body.phone_number.startsWith('62')) {
				body.phone_number = '+'.concat(body.phone_number);
			}
			const user = await this.manager.findOne(User, {
				phone_number: body.phone_number,
				type: UserType.MERCHANT
			});
			if (typeof user === 'undefined') {
				throw new BadRequest(`Phone number ${body.phone_number} is not a registered merchant.`);
			}
			let verificationCode = await this.manager.findOne(VerificationCode, {
				type: VerificationCodeType.PHONE_NUMBER,
				user_id: user.user_id
			});
			if (typeof verificationCode !== 'undefined') {
				const delta = (new Date()).getTime() - verificationCode.created_at.getTime();
				if (delta < (30 * 1000)) {
					const waitTime = Math.ceil(((30 * 1000) - delta) / 1000);
					throw new BadRequest(`Please wait ${waitTime} seconds to request new phone verification code.`);
				}
				await this.manager.remove(verificationCode);
			}
			verificationCode = new VerificationCode();
			verificationCode.type = VerificationCodeType.PHONE_NUMBER;
			verificationCode.user_id = user.user_id;
			verificationCode.value = MerchantAuthenticationController.generateVerificationCode();
			verificationCode = await this.manager.save(verificationCode);
			const client = twilio(MessagingConfig.twilio.accountServiceID, MessagingConfig.twilio.authToken);
			await client.messages.create({
				body: `
<#> Verification Code OFO Merchant: ${verificationCode.value}

DO NOT GIVE THIS SECRET CODE TO ANYONE, INCLUDING THOSE CLAIMING TO BE FROM OFO

Call 0857-2563-9268 for help

${user.user_id}`,
				messagingServiceSid: MessagingConfig.twilio.messagingServiceID,
				to: body.phone_number
			});
			await this.databaseService.commit();
			return 'We have sent a verification code to your phone number.';
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}

	@Post('/phone_verification/verify')
	@ValidateRequest({
		body: ['phone_number', 'verification_code'],
		useTrim: true
	})
	public async verifyPhoneVerification(@Req() request: Req, @Res() response: Res): Promise<{
		has_security_code: boolean,
		one_time_token: string
	}> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				phone_number: request.body.phone_number,
				verification_code: request.body.verification_code,
			};
			if (body.phone_number.startsWith('0')) {
				body.phone_number = '62'.concat(body.phone_number.substring(1));
			}
			if (body.phone_number.startsWith('62')) {
				body.phone_number = '+'.concat(body.phone_number);
			}
			const user = await this.manager.findOne(User, {
				phone_number: body.phone_number,
				type: UserType.MERCHANT
			});
			if (typeof user === 'undefined') {
				throw new BadRequest(`Phone number ${body.phone_number} is not a registered user.`);
			}
			let verificationCode = await this.manager.findOne(VerificationCode, {
				type: VerificationCodeType.PHONE_NUMBER,
				user_id: user.user_id,
			});
			if (typeof verificationCode === 'undefined') {
				throw new BadRequest(`You have never request verification code via phone number.`);
			}
			if (verificationCode.value !== body.verification_code) {
				throw new BadRequest(`The verification code you entered is invalid.`);
			}
			await this.manager.remove(verificationCode);
			let oneTimeToken = new OneTimeToken();
			oneTimeToken.user_id = user.user_id;
			oneTimeToken = await this.manager.save(oneTimeToken);
			await this.databaseService.commit();
			return {
				has_security_code: user.has_security_code,
				one_time_token: oneTimeToken.one_time_token_id
			};
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}

	@Post('/sign_in')
	@ValidateRequest({
		body: [ 'one_time_token', 'security_code' ],
		useTrim: true
	})
	public async signIn(@Req() request: Req, @Res() response: Res): Promise<{ user: User, token: string }> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				one_time_token: request.body.one_time_token,
				security_code: request.body.security_code,
			};
			const numericRegExp = new RegExp(/^[0-9]+$/);
			if (body.security_code.length !== 6 || !numericRegExp.test(body.security_code)) {
				throw new BadRequest('Security code must be 6 numerical characters.')
			}
			let oneTimeToken = await this.manager.findOne(OneTimeToken, {
				one_time_token_id: body.one_time_token
			});
			if (typeof oneTimeToken === 'undefined') {
				throw new BadRequest(`The provided One Time Token is invalid.`);
			}
			let user = await this.manager.findOne(User, {
				user_id: oneTimeToken.user_id
			});
			if (typeof user === 'undefined') {
				throw new BadRequest(`The provided One Time Token is invalid.`);
			}
			await this.manager.remove(oneTimeToken);
			if (!(await argon2.verify(user.security_code, body.security_code))) {
				throw new BadRequest(`Security code is invalid!`);
			}
			const payload = user.user_id;
			const token = jwt.sign(payload, PassportConfig.jwt.secret);
			await this.databaseService.commit();
			return { user, token };
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}

}
