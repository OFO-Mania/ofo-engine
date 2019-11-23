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

import fs from "fs";
import path from "path";
import uuid from 'uuid';
import { Controller, Delete, Get, Post, Req, UseAuth } from '@tsed/common';
import { MultipartFile } from '@tsed/multipartfiles';
import { EntityManager } from 'typeorm';
import { BadRequest } from 'ts-httpexceptions';

import { ValidateRequest } from '../../../decorators/ValidateRequestDecorator';
import { MerchantAuthenticationMiddleware } from '../../../middlewares/MerchantAuthenticationMiddleware';
import { DatabaseService } from '../../../services/DatabaseService';
import { PushNotificationService } from '../../../services/PushNotificationService';
import { User } from '../../../model/User';
import { Deal } from '../../../model/Deal';

@Controller('/merchant')
export class MerchantDealController {
	private manager: EntityManager;

	constructor(
		private databaseService: DatabaseService,
		private pushNotificationService: PushNotificationService
	) { }

	public $afterRoutesInit(): void {
		this.manager = this.databaseService.getManager();
	}

	@Get('/deals')
	@UseAuth(MerchantAuthenticationMiddleware)
	public async fetchDeals(@Req() request: Req): Promise<{
		deals: Deal[]
	}> {
		const merchant: User = <User> (<any>request).user;
		return {
			// @ts-ignore
			deals: await this.manager.find(Deal, {
				user_id: merchant.user_id
			})
		};
	}

	@Post('/deal')
	@ValidateRequest({
		body: [ 'name', 'description', 'terms' ],
		files: [ 'image' ],
		useTrim: true,
	})
	@UseAuth(MerchantAuthenticationMiddleware)
	public async createDeal(
		@MultipartFile('image') file: Express.Multer.File,
		@Req() request: Req
	): Promise<{ deal: Deal }> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				name: request.body.name,
				description: request.body.description,
				terms: request.body.terms,
			};
			const allowedImageFileExts = ['png', 'jpg', 'jpeg', 'gif'];
			const dealImageFileExt = file.originalname.split('.')[1].toLowerCase();
			const dealImageFileName = uuid.v1().concat('.').concat(dealImageFileExt);
			const isAllowedExt = allowedImageFileExts.includes(dealImageFileExt);
			const isAllowedMimeType = file.mimetype.startsWith('image/');
			if (!isAllowedExt || !isAllowedMimeType) {
				throw new BadRequest('The uploaded file is not an image file.')
			}
			const merchant: User = <User> (<any>request).user;
			const ugcPath = path.join(process.cwd(), 'ugc');
			const merchantUgcPath = path.join(ugcPath, merchant.user_id);
			const dealImageDirPath = path.join(merchantUgcPath, 'deals');
			const dealImageFilePath = path.join(dealImageDirPath, dealImageFileName);
			if (!fs.existsSync(ugcPath)) {
				fs.mkdirSync(ugcPath);
			}
			if (!fs.existsSync(merchantUgcPath)) {
				fs.mkdirSync(merchantUgcPath);
			}
			if (!fs.existsSync(dealImageDirPath)) {
				fs.mkdirSync(dealImageDirPath);
			}
			fs.renameSync(file.path, dealImageFilePath);
			const end_at = new Date();
			end_at.setDate(end_at.getDate() + 7)
			let deal = new Deal();
			deal.name = body.name;
			deal.description = body.description;
			deal.terms = body.terms;
			deal.merchant_id = merchant.user_id;
			deal.start_at = new Date();
			deal.end_at = end_at;
			deal.image = `https://${process.env.BASE_DOMAIN}/static/${merchant.user_id}/deals/${dealImageFileName}`;
			deal = await this.manager.save(deal);
			await this.databaseService.commit();
			await this.pushNotificationService.sendNotification({
				title: 'OFO new deal!',
				message: deal.name,
				image: deal.image
			});
			return { deal };
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}

	@Delete('/deal')
	@ValidateRequest({
		query: [ 'deal_id' ],
		useTrim: true,
	})
	@UseAuth(MerchantAuthenticationMiddleware)
	public async removeDeal(
		@MultipartFile('image') file: Express.Multer.File,
		@Req() request: Req
	): Promise<string> {
		try {
			await this.databaseService.startTransaction();
			const body = {
				deal_id: request.body.deal_id
			};
			const deal = await this.manager.findOne(Deal, {
				deal_id: body.deal_id
			});
			if (typeof deal === 'undefined') {
				throw new BadRequest(`There is no deal with identifier ${body.deal_id}.`)
			}
			await this.manager.remove(deal);
			await this.databaseService.commit();
			return `Deal "${deal.name}" has been successfully removed!`;
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}
	}

}
