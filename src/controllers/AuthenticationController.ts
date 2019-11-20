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
import { sign } from 'jsonwebtoken';

import { MessagingConfig } from '../config/messaging.config';
import { PassportConfig } from '../config/passport.config';
import { ValidateRequest } from '../decorators/ValidateRequestDecorator';
import { DatabaseService } from '../services/DatabaseService';
import { UserAuthenticationMiddleware } from '../middlewares/UserAuthenticationMiddleware';
import { User, UserType } from '../model/User';
import { Otp, OtpType } from '../model/Otp';

@Controller('/')
@Docs('api-v1')
export class AuthenticationController {

	private manager: EntityManager;

	constructor(private databaseService: DatabaseService) {}

	private static generateOTP(): string {
		const availableCharacters = '0123456789';
		const otp = [];
		for (let i = 0; i < 6; i++) {
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
		body: ['full_name', 'phone_number', 'email_address'],
		useTrim: true
	})
	public async join(@Req() request: Req, @Res() response: Res): Promise<User> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				full_name: request.body.email_address,
				phone_number: request.body.phone_number,
				email_address: request.body.email_address,
				referral_code: request.body.referral_code,
			};
			const emailRegExp = new RegExp(
				/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
			);
			if (!emailRegExp.test(body.email_address)) {
				throw new BadRequest(`Email address ${body.email_address} is not a valid email address.`)
			}
			let user = await this.manager.findOne(User, {
				email_address: body.email_address
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
				phone_number: body.phone_number
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
			user = await this.manager.save(user);
			await this.databaseService.commit();
			return user;
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
	public async sendPhoneVerification(@Req() request: Req, @Res() response: Res): Promise<User> {
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
				phone_number: body.phone_number
			});
			if (typeof user === 'undefined') {
				throw new BadRequest(`Phone number ${body.phone_number} is not a registered user.`);
			}
			let otp = await this.manager.findOne(Otp, {
				type: OtpType.PHONE_NUMBER,
				user_id: user.user_id
			});
			if (typeof otp !== 'undefined') {
				const delta = (new Date()).getTime() - otp.created_at.getTime();
				if (delta < (30 * 1000)) {
					const waitTime = Math.ceil(((30 * 1000) - delta) / 1000);
					throw new BadRequest(`Please wait ${waitTime} seconds to request new verification code.`);
				}
				await this.manager.remove(otp);
			}
			otp = new Otp();
			otp.type = OtpType.PHONE_NUMBER;
			otp.user_id = user.user_id;
			// For now
			otp.key = AuthenticationController.generateOTP();
			otp = await this.manager.save(otp);
			// Send Twilio
			const client = twilio(MessagingConfig.twilio.accountServiceID, MessagingConfig.twilio.authToken);
			const message = client.messages.create({
				body: `<#> Verification Code OFO: ${otp.key}


DO NOT GIVE THIS SECRET CODE TO ANYONE, INCLUDING THOSE CLAIMING TO BE FROM OFO

Call 0857-2563-9268 for help
${user.user_id}`,
				messagingServiceSid: MessagingConfig.twilio.messagingServiceID,
				to: body.phone_number
			});
			await this.databaseService.commit();
			return user;
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
	public async verifyPhoneVerification(@Req() request: Req, @Res() response: Res): Promise<User> {
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
				phone_number: body.phone_number
			});
			if (typeof user === 'undefined') {
				throw new BadRequest(`Phone number ${body.phone_number} is not a registered user.`);
			}
			let otp = await this.manager.findOne(Otp, {
				type: OtpType.PHONE_NUMBER,
				user_id: user.user_id,
			});
			if (typeof otp === 'undefined') {
				throw new BadRequest(`You have never request verification code via phone number.`);
			}
			if (otp.key !== body.verification_code) {
				throw new BadRequest(`The verification code you entered is invalid.`);
			}
			await this.manager.remove(otp);
			await this.databaseService.commit();
			return user;
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}

	@Post('/email_address/send')
	@ValidateRequest({
		body: ['email_address'],
		useTrim: true
	})
	public async sendEmailVerification(@Req() request: Req, @Res() response: Res): Promise<User> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				email_address: request.body.email_address,
			};
			const emailRegExp = new RegExp(
				/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
			);
			if (!emailRegExp.test(body.email_address)) {
				throw new BadRequest(`Email address ${body.email_address} is not a valid email address.`)
			}
			const user = await this.manager.findOne(User, {
				email_address: body.email_address
			});
			if (typeof user === 'undefined') {
				throw new BadRequest(`Email address ${body.email_address} is not a registered user.`);
			}
			let otp = await this.manager.findOne(Otp, {
				type: OtpType.EMAIL_ADDRESS,
				user_id: user.user_id
			});
			if (typeof otp !== 'undefined') {
				const delta = (new Date()).getTime() - otp.created_at.getTime();
				if (delta < (30 * 1000)) {
					const waitTime = Math.ceil(((30 * 1000) - delta) / 1000);
					throw new BadRequest(`Please wait ${waitTime} seconds to request new verification code.`);
				}
				await this.manager.remove(otp);
			}
			otp = new Otp();
			otp.type = OtpType.EMAIL_ADDRESS;
			otp.user_id = user.user_id;
			otp.key = AuthenticationController.generateOTP();
			otp = await this.manager.save(otp);
			// Send E-mail
			const message = {
				to: user.email_address,
				from: 'noreply@ofo.id',
				subject: 'Your Verification Code',
				html: `
<div>
	Hi, ${user.full_name}!<br /><br />
	Welcome to OFO e-Money! Please enter the code <b>${otp.key}</b> on the OFO app to continue with the registration.<br /><br />
	Regards,<br />
	OFO Operation Team
</div>
`,
			};
			await SendGridMail.send(message);
			await this.databaseService.commit();
			return user;
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}

	@Post('/email_verification/verify')
	@ValidateRequest({
		body: ['email_address, verification_code'],
		useTrim: true
	})
	public async verifyEmailVerification(@Req() request: Req, @Res() response: Res): Promise<{
		token: string
	}> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				email_address: request.body.email_address,
				verification_code: request.body.verification_code
			};
			const emailRegExp = new RegExp(
				/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
			);
			if (!emailRegExp.test(body.email_address)) {
				throw new BadRequest(`Email address ${body.email_address} is not a valid email address.`)
			}
			let user = await this.manager.findOne(User, {
				email_address: body.email_address
			});
			if (typeof user === 'undefined') {
				throw new BadRequest(`Email address ${body.email_address} is not a registered user.`);
			}
			let otp = await this.manager.findOne(Otp, {
				type: OtpType.EMAIL_ADDRESS,
				user_id: user.user_id
			});
			if (typeof otp === 'undefined') {
				throw new BadRequest(`You have never request verification code via email address`);
			}
			if (otp.key !== body.verification_code) {
				throw new BadRequest(`The verification code you entered is invalid.`)
			}
			await this.manager.remove(otp);
			const { security_code, ...payload } = user;
			const token = sign(payload, PassportConfig.jwt.secret);
			await this.databaseService.commit();
			return { token };
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}

	@Post('/join/set_security_code')
	@ValidateRequest({
		body: ['security_code'],
		useTrim: true
	})
	@UseAuth(UserAuthenticationMiddleware)
	public async setSecurityCode(@Req() request: Req, @Res() response: Res): Promise<User> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				security_code: request.body.security_code,
			};
			if (body.security_code.length !== 6 || !isNaN(body.security_code)) {
				throw new BadRequest('Security code must be 6 numerical characters.')
			}
			let user: User = <User> (<any>request).user;
			user.security_code = await argon2.hash(body.security_code);
			user = await this.manager.save(user);
			await this.databaseService.commit();
			return user;
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}

}
