import { Controller, Get, Post, Req, UseAuth, AuthenticatedMiddleware } from '@tsed/common';
import { Docs } from '@tsed/swagger';
import { BadRequest, NotFound } from 'ts-httpexceptions';
import { EntityManager } from 'typeorm';

import { DatabaseService } from '../../services/DatabaseService';
import { ValidateRequest } from '../../decorators/ValidateRequestDecorator';
import { Transaction } from '../../model/Transaction';
import { User } from '../../model/User';
import { UserAuthenticationMiddleware } from '../../middlewares/UserAuthenticationMiddleware';

@Controller('/')
@Docs('api-v1')
export class TransactionController {
    private manager: EntityManager;

    constructor(private databaseService: DatabaseService) { }

    public $afterRoutesInit(): void {
        this.manager = this.databaseService.getManager();
    }

    // @Post('/transaction')
    // @UseAuth(UserAuthenticationMiddleware)
    // public async create(@Req() request): Promise<{ $data: Transaction, $message: string }> {
    //     const user: User = (<any>request).user;
	// 	try {
	// 		await this.databaseService.startTransaction();
	// 		let transaction = new Transaction();
	// 		transaction.user_id = user.user_id;
	// 		transaction = await this.manager.save(transaction);
	// 		await this.databaseService.commit();
	// 		return { $data: transaction, $message: 'Successfully created new transaction.' };
	// 	} catch (error) {
	// 		await this.databaseService.rollback();
	// 		throw error;
	// 	}
    // }

    @Post('/transfer_ofo')
    @ValidateRequest({
        query: ['user_id'],
        body: ['phone_number', 'amount', 'note'],
        useTrim: true
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async addTransferOfo(@Req() request): Promise<void> {
        const query = {
            user_id: request.query.user_id
        }
        const body = {
            phone_number: request.body.phone_number,
            amount: parseInt(request.body.value),
            note: request.body.note,
        };
        try {
            await this.databaseService.startTransaction();
            const transfer_ofo = await this.manager.findOne(Transaction, query.user_id);
            if (typeof transfer_ofo === 'undefined') {
                throw new NotFound('Transaction with ID ' + query.user_id + ' is not found.');
            }

        


            
            


        } catch (error) {
            await this.databaseService.rollback();
        }
    }
}
