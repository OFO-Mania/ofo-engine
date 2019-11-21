import { Controller, Get, Post, Req, UseAuth, AuthenticatedMiddleware } from '@tsed/common';
import { Docs } from '@tsed/swagger';
import { BadRequest, NotFound } from 'ts-httpexceptions';
import { EntityManager } from 'typeorm';

import { DatabaseService } from '../../services/DatabaseService';
import { ValidateRequest } from '../../decorators/ValidateRequestDecorator';
import { Transaction, TargetType, FlowType } from '../../model/Transaction';
import { User, UserType } from '../../model/User';
import { UserAuthenticationMiddleware } from '../../middlewares/UserAuthenticationMiddleware';
import { BalanceHistory, BalanceType } from '../../model/BalanceHistory';
import { BankAccount } from '../../model/BankAccount';

@Controller('/transaction')
@Docs('api-v1')
export class TransactionController {
    private manager: EntityManager;

    constructor(private databaseService: DatabaseService) { }

    public $afterRoutesInit(): void {
        this.manager = this.databaseService.getManager();
    }

    @Get('/history')
    @ValidateRequest({
        useTrim: true
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async transactionHistory(@Req() request): Promise<{ transaction: Transaction[] }> {
        const user: User = (<any>request).user;
        const transaction = await this.manager.find(Transaction, {
            user_id: user.user_id
        })
        return {
            transaction: transaction
        };
    }

    @Post('/transfer/user')
    @ValidateRequest({
        body: ['phone_number', 'amount'],
        useTrim: true
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async addTransferUser(@Req() request: Req): Promise<{ user: User, transaction: Transaction }> {
        try {
            await this.databaseService.startTransaction();
            const body = {
                phone_number: request.body.phone_number,
                amount: parseInt(request.body.amount),
                note: request.body.note,
            };
            if (body.phone_number.startsWith('0')) {
                body.phone_number = '62'.concat(body.phone_number.substring(1));
            }
            if (body.phone_number.startsWith('62')) {
                body.phone_number = '+'.concat(body.phone_number);
            }
            let sender: User = (<any>request).user;
            let receiver = await this.manager.findOne(User, {
                phone_number: body.phone_number,
            });
            if (typeof receiver === 'undefined') {
                throw new BadRequest(`Phone number ${body.phone_number} is not a registered user.`);
            }
            if (body.amount <= 0) {
                throw new BadRequest('Amount should be more than 0. Given: ' + body.amount + '.');
            }
            if (body.amount > sender.current_balance) {
                throw new BadRequest('You have insufficient OFO Cash');
            }

            //add new transaction sender
            let outgoingTransaction = new Transaction();
            outgoingTransaction.target_id = receiver.user_id;
            outgoingTransaction.amount = body.amount;
            outgoingTransaction.target_type = TargetType.USER;
            outgoingTransaction.user_id = sender.user_id;
            outgoingTransaction.flow = FlowType.OUTGOING;
            outgoingTransaction.note = body.note;

            //add new transaction receiver
            let incomingTransaction = new Transaction();
            incomingTransaction.target_id = sender.user_id;
            incomingTransaction.amount = body.amount;
            incomingTransaction.target_type = TargetType.USER;
            incomingTransaction.user_id = receiver.user_id;
            incomingTransaction.flow = FlowType.INCOMING;
            incomingTransaction.note = body.note;

            //update balance in sender user
            sender.current_balance = sender.current_balance - body.amount;

            //update balance in receiver user
            receiver.current_balance = receiver.current_balance + body.amount;

            const results = await Promise.all([
                this.manager.save(outgoingTransaction),
                this.manager.save(incomingTransaction),
                this.manager.save(sender),
                this.manager.save(receiver),
            ])

            //defining new results after sending to database
            outgoingTransaction = results[0];
            incomingTransaction = results[1];
            sender = results[2];
            receiver = results[3];

            //add balance history in sender user
            let senderBalanceHistory = new BalanceHistory();
            senderBalanceHistory.user_id = sender.user_id;
            senderBalanceHistory.balance = sender.current_balance;
            senderBalanceHistory.type = BalanceType.OFO_CASH;

            //add balance history in receiver user
            let receiverBalanceHistory = new BalanceHistory();
            receiverBalanceHistory.user_id = receiver.user_id;
            receiverBalanceHistory.balance = receiver.current_balance;
            receiverBalanceHistory.type = BalanceType.OFO_CASH;

            await Promise.all([
                this.manager.save(senderBalanceHistory),
                this.manager.save(receiverBalanceHistory),
            ])

            await this.databaseService.commit();
            return {
                user: sender,
                transaction: outgoingTransaction,
            };

        } catch (error) {
            await this.databaseService.rollback();
        }
    }

    // @Get('/bank')
    // @ValidateRequest({
    //     useTrim: true
    // })
    // @UseAuth(UserAuthenticationMiddleware)
    // public async getBanks(@Req() request): Promise<{ banks: BankAccount[] }> {
    //     const banks = await this.manager.find(BankAccount);
    //     return {
    //         banks: banks,
    //     }
    // }

    @Get('/merchants')
    @ValidateRequest({
        useTrim: true
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async getMerchants(@Req() request): Promise<{ merchants: User[] }> {
        const merchants = await this.manager.find(User, {
            type: UserType.MERCHANT,
        })
        return {
            merchants: merchants
        };
    }

    @Post('/transfer/bank')
    @ValidateRequest({
        body: ['bank_id, account, amount'],
        useTrim: true,
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async transferBank(@Req() request): Promise<{ user: User, transaction: Transaction }> {      
        try {
            const body = {
                bank_id: request.body.bank_id,
                amount: parseInt(request.body.amount),
                account: request.body.account,
                note: request.body.note,
            };
            let user: User = (<any>request).user;
            //validate amount
            if (body.amount <= 0) {
                throw new BadRequest('Amount should be more than 0. Given: ' + body.amount + '.');
            }

            let transaction = new Transaction();
            transaction.target_id = body.account;
            transaction.amount = body.amount;
            transaction.target_type = TargetType.BANK;
            transaction.user_id = user.user_id;
            transaction.flow = FlowType.INCOMING;
            transaction.note = body.note;

            user.current_balance = user.current_balance - body.amount;

            const results = await Promise.all([
                this.manager.save(transaction),
                this.manager.save(user),
            ])

            transaction = results[0];
            user = results[1];

            let balanceHistory = new BalanceHistory();
            balanceHistory.user_id = user.user_id;
            balanceHistory.balance = user.current_balance;
            balanceHistory.type = BalanceType.OFO_CASH;
            await this.manager.save(balanceHistory);

            await this.databaseService.commit();
            return {
                user: user,
                transaction: transaction,
            };
            

        } catch (error) {
            await this.databaseService.rollback();
        }
    }

    @Post('/oneklik')
    @ValidateRequest({
        body: ['amount'],
        useTrim: true
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async topupOneklik(@Req() request): Promise<{ user: User, transaction: Transaction }> {
        try {
            const body = {
                amount: parseInt(request.body.amount),
            };
            if (body.amount <= 0) {
                throw new BadRequest('Amount should be more than 0. Given: ' + body.amount + '.');
            }
            let user: User = (<any>request).user;
            let bank_account = '';
            let transaction = new Transaction();
            transaction.target_id = bank_account;
            transaction.amount = body.amount;
            transaction.flow = FlowType.INCOMING;
            transaction.target_type = TargetType.BANK;
            transaction.user_id = user.user_id;

            user.current_balance = user.current_balance + body.amount;

            const results = await Promise.all([
                this.manager.save(transaction),
                this.manager.save(user),
            ])
            
            transaction = results[0];
            user = results[1];

            let balanceHistory = new BalanceHistory();
            balanceHistory.user_id = user.user_id;
            balanceHistory.balance = user.current_balance;
            balanceHistory.type = BalanceType.OFO_CASH;
            balanceHistory = await this.manager.save(balanceHistory);

            await this.databaseService.commit();
            return {
                user: user,
                transaction: transaction,
            };
        } catch (error) {
            await this.databaseService.rollback();
        }
    }

    // @Post('/payment/pln/prepaid')
    // @ValidateRequest({
    //     body: ['amount'],
    //     useTrim: true
    // })

}