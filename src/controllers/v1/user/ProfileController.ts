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

import fs from 'fs';
import path from 'path';
import { Controller, Get, Patch, Post, Req, UseAuth } from '@tsed/common';
import { Docs } from '@tsed/swagger';
import { MultipartFile } from '@tsed/multipartfiles';
import { EntityManager } from 'typeorm';

import { ValidateRequest } from '../../../decorators/ValidateRequestDecorator';
import { UserAuthenticationMiddleware } from '../../../middlewares/UserAuthenticationMiddleware';
import { DatabaseService } from '../../../services/DatabaseService';
import { User } from '../../../model/User';
import uuid from 'uuid';
import { BadRequest } from 'ts-httpexceptions';

@Controller('/profile')
@Docs('api-v1')
export class ProfileController {

	private manager: EntityManager;

	constructor(private databaseService: DatabaseService) {}

	public $afterRoutesInit(): void {
		this.manager = this.databaseService.getManager();
	}

	@Get('/')
	@UseAuth(UserAuthenticationMiddleware)
	public getProfile(@Req() request: Req): User {
		return (<any>request).user;
	}

	@Patch('/')
	@ValidateRequest({
		file: 'image'
	})
	@UseAuth(UserAuthenticationMiddleware)
	public async modifyProfile(@MultipartFile('image') file: Express.Multer.File, @Req() request: Req): Promise<{ user: User }> {
		try {
			await this.databaseService.startTransaction();
			const allowedImageFileExts = ['png', 'jpg', 'jpeg', 'gif'];
			const userImageFileExt = file.originalname.split('.')[1].toLowerCase();
			const userImageFileName = uuid.v1().concat(userImageFileExt);
			const isAllowedExt = allowedImageFileExts.includes(userImageFileExt);
			const isAllowedMimeType = file.mimetype.startsWith('image/');
			if (!isAllowedExt || !isAllowedMimeType) {
				throw new BadRequest('The uploaded file is not an image file.')
			}
			let user: User = <User> (<any>request).user;
			const ugcPath = path.join(process.cwd(), 'ugc');
			const userUgcPath = path.join(ugcPath, user.user_id);
			const userImageDirPath = path.join(userUgcPath, 'profile-images');
			const userImageFilePath = path.join(userImageDirPath, userImageFileName);
			if (!fs.existsSync(ugcPath)) {
				fs.mkdirSync(ugcPath);
			}
			if (!fs.existsSync(userUgcPath)) {
				fs.mkdirSync(userUgcPath);
			}
			if (!fs.existsSync(userImageDirPath)) {
				fs.mkdirSync(userImageDirPath);
			}
			fs.renameSync(file.path, userImageFilePath);
			user.image = `https://${process.env.BASE_DOMAIN}/static/${user.user_id}/profile-images/${userImageFileName}`;
			user = await this.manager.save(user);
			await this.databaseService.commit();
			return { user };
		} catch (error) {
			await this.databaseService.rollback();
			throw error;
		}


	}

}
