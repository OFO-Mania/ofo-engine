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

import { Controller, Post, Req, Res, UseAuth } from '@tsed/common';
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
import { Device, DeviceType } from '../model/Device';
import { UserAuthenticationMiddleware } from '../middlewares/UserAuthenticationMiddleware';
import { MailConfig } from '../config/mail.config';

@Controller('/auth')
@Docs('api-v1')
export class UserAuthenticationController {
	private manager: EntityManager;

	constructor(private databaseService: DatabaseService) {}

	private static generateVerificationCode(): string {
		const availableCharacters = '0123456789';
		const otp = [];
		for (let i = 0; i < 4; i++) {
			otp.push(availableCharacters.charAt(Math.floor(Math.random() * availableCharacters.length)));
		}
		return otp.join('');
	}

	public $afterRoutesInit(): void {
		this.manager = this.databaseService.getManager();
	}

	@Post('/join')
	@ValidateRequest({
		body: ['full_name', 'phone_number', 'email_address'],
		useTrim: true,
	})
	public async join(@Req() request: Req, @Res() response: Res): Promise<{ user: User }> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				full_name: request.body.full_name,
				phone_number: request.body.phone_number,
				email_address: request.body.email_address,
				referral_code: request.body.referral_code || null,
			};
			const emailRegExp = new RegExp(
				/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
			);
			if (!emailRegExp.test(body.email_address)) {
				throw new BadRequest(`Email address ${body.email_address} is not a valid email address.`);
			}
			let user = await this.manager.findOne(User, {
				email_address: body.email_address,
				type: UserType.USER,
			});
			if (typeof user !== 'undefined') {
				if (user.is_verified) {
					throw new BadRequest(`Email address ${body.email_address} has already registered.`);
				} else {
					await this.manager.remove(user);
				}
			}
			if (body.phone_number.length < 10) {
				throw new BadRequest('Phone number should be minimum of 10 digit.');
			}
			if (body.phone_number.startsWith('0')) {
				body.phone_number = '62'.concat(body.phone_number.substring(1));
			}
			if (body.phone_number.startsWith('62')) {
				body.phone_number = '+'.concat(body.phone_number);
			}
			user = await this.manager.findOne(User, {
				phone_number: body.phone_number,
				type: UserType.USER,
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
			user.referral_code = body.referral_code;
			user.image = '';
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
		useTrim: true,
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
				type: UserType.USER,
			});
			if (typeof user === 'undefined') {
				throw new BadRequest(`Phone number ${body.phone_number} is not a registered user.`);
			}
			let verificationCode = await this.manager.findOne(VerificationCode, {
				type: VerificationCodeType.PHONE_NUMBER,
				user_id: user.user_id,
			});
			if (typeof verificationCode !== 'undefined') {
				const delta = new Date().getTime() - verificationCode.created_at.getTime();
				if (delta < 30 * 1000) {
					const waitTime = Math.ceil((30 * 1000 - delta) / 1000);
					throw new BadRequest(`Please wait ${waitTime} seconds to request new phone verification code.`);
				}
				await this.manager.remove(verificationCode);
			}
			verificationCode = new VerificationCode();
			verificationCode.type = VerificationCodeType.PHONE_NUMBER;
			verificationCode.user_id = user.user_id;
			verificationCode.value = UserAuthenticationController.generateVerificationCode();
			verificationCode = await this.manager.save(verificationCode);
			const textMessage = `
<#> Verification Code OFO: ${verificationCode.value}

DO NOT GIVE THIS SECRET CODE TO ANYONE, INCLUDING THOSE CLAIMING TO BE FROM OFO

Call 0857-2563-9268 for help

${user.user_id}`;
			await this.databaseService.commit();
			if (MessagingConfig.twilio.enable) {
				const client = twilio(MessagingConfig.twilio.accountServiceID, MessagingConfig.twilio.authToken);
				await client.messages.create({
					body: textMessage,
					messagingServiceSid: MessagingConfig.twilio.messagingServiceID,
					to: body.phone_number,
				});
				return 'We have sent a verification code to your phone number.';
			} else {
				return textMessage;
			}
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}

	@Post('/phone_verification/verify')
	@ValidateRequest({
		body: ['phone_number', 'verification_code'],
		useTrim: true,
	})
	public async verifyPhoneVerification(
		@Req() request: Req,
		@Res() response: Res
	): Promise<{
		has_security_code: boolean;
		one_time_token: string;
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
				type: UserType.USER,
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
				one_time_token: oneTimeToken.one_time_token_id,
			};
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}

	@Post('/email_verification/send')
	@ValidateRequest({
		body: ['email_address'],
		useTrim: true,
	})
	public async sendEmailVerification(@Req() request: Req, @Res() response: Res): Promise<string> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				one_time_token: request.body.one_time_token,
				email_address: request.body.email_address,
			};
			const emailRegExp = new RegExp(
				/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
			);
			if (!emailRegExp.test(body.email_address)) {
				throw new BadRequest(`Email address ${body.email_address} is not a valid email address.`);
			}
			const user = await this.manager.findOne(User, {
				email_address: body.email_address,
				type: UserType.USER,
			});
			if (typeof user === 'undefined') {
				throw new BadRequest(`Email address ${body.email_address} is not a registered user.`);
			}
			let verificationCode = await this.manager.findOne(VerificationCode, {
				type: VerificationCodeType.EMAIL_ADDRESS,
				user_id: user.user_id,
			});
			if (typeof verificationCode !== 'undefined') {
				const delta = new Date().getTime() - verificationCode.created_at.getTime();
				if (delta < 30 * 1000) {
					const waitTime = Math.ceil((30 * 1000 - delta) / 1000);
					throw new BadRequest(`Please wait ${waitTime} seconds to request new email verification code.`);
				}
				await this.manager.remove(verificationCode);
			}
			verificationCode = new VerificationCode();
			verificationCode.type = VerificationCodeType.EMAIL_ADDRESS;
			verificationCode.user_id = user.user_id;
			verificationCode.value = UserAuthenticationController.generateVerificationCode();
			verificationCode = await this.manager.save(verificationCode);
			await this.databaseService.commit();
			// Send E-mail
			if (MailConfig.enable) {
				const message = {
					to: user.email_address,
					from: 'OFO <noreply@ofo.id>',
					subject: 'Your Verification Code',
					html: `
<div>
Please verify your email<br/><br/>
Dear ${user.full_name},<br/><br/>
You have registered to Join OFO<br/><br/>
To confirm that this is your email, please insert the Verification Code: ${verificationCode.value} on the verification page<br/><br/>
<span style="text-align: center">Please ignore this email if you did not register an account through OFO</span>
</div>
`,
				};
				await SendGridMail.send(message);
				return 'We have sent a verification code to your email address.';
			} else {
				return `Your verification code is ${verificationCode.value}. [Mail Service Disabled]`;
			}
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}

	@Post('/email_verification/verify')
	@ValidateRequest({
		body: ['email_address', 'verification_code'],
		useTrim: true,
	})
	public async verifyEmailVerification(
		@Req() request: Req,
		@Res() response: Res
	): Promise<{
		one_time_token: string;
	}> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				email_address: request.body.email_address,
				verification_code: request.body.verification_code,
			};
			const emailRegExp = new RegExp(
				/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
			);
			if (!emailRegExp.test(body.email_address)) {
				throw new BadRequest(`Email address ${body.email_address} is not a valid email address.`);
			}
			let user = await this.manager.findOne(User, {
				email_address: body.email_address,
				type: UserType.USER,
			});
			if (typeof user === 'undefined') {
				throw new BadRequest(`Email address ${body.email_address} is not a registered user.`);
			}
			let verificationCode = await this.manager.findOne(VerificationCode, {
				type: VerificationCodeType.EMAIL_ADDRESS,
				user_id: user.user_id,
			});
			if (typeof verificationCode === 'undefined') {
				throw new BadRequest(`You have never request verification code via email address`);
			}
			if (verificationCode.value !== body.verification_code) {
				throw new BadRequest(`The verification code you entered is invalid.`);
			}
			await this.manager.remove(verificationCode);
			user.is_verified = true;
			user = await this.manager.save(user);
			let oneTimeToken = new OneTimeToken();
			oneTimeToken.user_id = user.user_id;
			oneTimeToken = await this.manager.save(oneTimeToken);
			await this.databaseService.commit();
			return { one_time_token: oneTimeToken.one_time_token_id };
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}

	@Post('/set_security_code')
	@ValidateRequest({
		body: ['one_time_token', 'security_code', 'device_type', 'device_id'],
		useTrim: true,
	})
	public async setSecurityCode(@Req() request: Req, @Res() response: Res): Promise<{ user: User; token: string }> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				one_time_token: request.body.one_time_token,
				security_code: request.body.security_code,
				device_type: request.body.device_type,
				device_id: request.body.device_id,
			};
			if (
				body.device_type.toUpperCase() !== DeviceType.IOS &&
				body.device_type !== DeviceType.ANDROID.toUpperCase()
			) {
				throw new BadRequest('Device type should be Android or iOS.');
			}
			if (body.device_id.length !== 36) {
				throw new BadRequest('Device identifier should be 36 long UUID.');
			}
			const numericRegExp = new RegExp(/^[0-9]+$/);
			if (body.security_code.length !== 6 || !numericRegExp.test(body.security_code)) {
				throw new BadRequest('Security code must be 6 numerical characters.');
			}
			let oneTimeToken = await this.manager.findOne(OneTimeToken, {
				one_time_token_id: body.one_time_token,
			});
			if (typeof oneTimeToken === 'undefined') {
				throw new BadRequest(`The provided One Time Token is invalid.`);
			}
			let user = await this.manager.findOne(User, {
				user_id: oneTimeToken.user_id,
			});
			if (typeof user === 'undefined') {
				throw new BadRequest(`The provided One Time Token is invalid.`);
			}
			await this.manager.remove(oneTimeToken);
			user.has_security_code = true;
			user.security_code = await argon2.hash(body.security_code);
			user = await this.manager.save(user);
			const payload = user.user_id;
			const token = jwt.sign(payload, PassportConfig.jwt.secret);
			await this.databaseService.commit();
			return { user, token };
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}

	@Post('/enter_gate')
	@ValidateRequest({
		body: ['security_code'],
		useTrim: true,
	})
	@UseAuth(UserAuthenticationMiddleware)
	public async enterGate(@Req() request: Req, @Res() response: Res): Promise<{ user: User; token: string }> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				security_code: request.body.security_code,
			};
			const numericRegExp = new RegExp(/^[0-9]+$/);
			if (body.security_code.length !== 6 || !numericRegExp.test(body.security_code)) {
				throw new BadRequest('Security code must be 6 numerical characters.');
			}
			const user: User = <User>(<any>request).user;
			if (!(await argon2.verify(user.security_code, body.security_code))) {
				throw new BadRequest(`Invalid security code!`);
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

	@Post('/sign_in')
	@ValidateRequest({
		body: ['one_time_token', 'security_code', 'device_type', 'device_id'],
		useTrim: true,
	})
	public async signIn(@Req() request: Req, @Res() response: Res): Promise<{ user: User; token: string }> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				one_time_token: request.body.one_time_token,
				security_code: request.body.security_code,
				device_type: request.body.device_type,
				device_id: request.body.device_id,
			};
			if (
				body.device_type.toUpperCase() !== DeviceType.IOS &&
				body.device_type !== DeviceType.ANDROID.toUpperCase()
			) {
				throw new BadRequest('Device type should be Android or iOS.');
			}
			if (body.device_id.length !== 36) {
				throw new BadRequest('Device identifier should be 36 long UUID.');
			}
			const numericRegExp = new RegExp(/^[0-9]+$/);
			if (body.security_code.length !== 6 || !numericRegExp.test(body.security_code)) {
				throw new BadRequest('Security code must be 6 numerical characters.');
			}
			let oneTimeToken = await this.manager.findOne(OneTimeToken, {
				one_time_token_id: body.one_time_token,
			});
			if (typeof oneTimeToken === 'undefined') {
				throw new BadRequest(`The provided One Time Token is invalid.`);
			}
			let user = await this.manager.findOne(User, {
				user_id: oneTimeToken.user_id,
			});
			if (typeof user === 'undefined') {
				throw new BadRequest(`The provided One Time Token is invalid.`);
			}
			if (!user.has_security_code) {
				throw new BadRequest('Please set security code first.');
			}
			await this.manager.remove(oneTimeToken);
			if (!(await argon2.verify(user.security_code, body.security_code))) {
				throw new BadRequest(`Invalid security code!`);
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

	@Post('/sign_out')
	@ValidateRequest({
		body: ['device_type', 'device_id'],
		useTrim: true,
	})
	@UseAuth(UserAuthenticationMiddleware)
	public async signOut(@Req() request: Req, @Res() response: Res): Promise<string> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				device_type: request.body.device_type,
				device_id: request.body.device_id,
			};
			if (
				body.device_type.toUpperCase() !== DeviceType.IOS &&
				body.device_type !== DeviceType.ANDROID.toUpperCase()
			) {
				throw new BadRequest('Device type should be Android or iOS.');
			}
			if (body.device_id.length !== 36) {
				throw new BadRequest('Device identifier should be 36 long UUID.');
			}
			const user: User = <User>(<any>request).user;
			// @ts-ignore
			const devices = await this.manager.find(Device, {
				user_id: user.user_id,
				device_id: body.device_id,
				device_type: body.device_type,
			});
			if (typeof devices !== 'undefined' && devices.length > 0) {
				const promises = devices.map((d) => this.manager.remove(d));
				await Promise.all(promises);
			}
			await this.databaseService.commit();
			return 'See you soon!';
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}
}
