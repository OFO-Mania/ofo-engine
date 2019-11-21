import { Controller, Get, Post, Req, UseAuth, AuthenticatedMiddleware } from '@tsed/common';
import { Docs } from '@tsed/swagger';
import { BadRequest, NotFound } from 'ts-httpexceptions';
import { EntityManager } from 'typeorm';

import { DatabaseService } from '../../../services/DatabaseService';
import { ValidateRequest } from '../../../decorators/ValidateRequestDecorator';
import { Transaction, TargetType, FlowType, WalletType } from '../../../model/Transaction';
import { User, UserType } from '../../../model/User';
import { UserAuthenticationMiddleware } from '../../../middlewares/UserAuthenticationMiddleware';
import { BalanceHistory, BalanceType } from '../../../model/BalanceHistory';
import { BankAccount, BankType } from '../../../model/BankAccount';
import { Payment, ServiceType } from '../../../model/Payment';

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
            if (body.amount > sender.balance_cash) {
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
            outgoingTransaction.wallet_type = WalletType.CASH;

            //add new transaction receiver
            let incomingTransaction = new Transaction();
            incomingTransaction.target_id = sender.user_id;
            incomingTransaction.amount = body.amount;
            incomingTransaction.target_type = TargetType.USER;
            incomingTransaction.user_id = receiver.user_id;
            incomingTransaction.flow = FlowType.INCOMING;
            incomingTransaction.note = body.note;
            incomingTransaction.wallet_type = WalletType.CASH;

            //update balance in sender user
            sender.balance_cash = sender.balance_cash - body.amount;

            //update balance in receiver user
            receiver.balance_cash = receiver.balance_cash + body.amount;

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
            senderBalanceHistory.balance = sender.balance_cash;
            senderBalanceHistory.type = BalanceType.OFO_CASH;

            //add balance history in receiver user
            let receiverBalanceHistory = new BalanceHistory();
            receiverBalanceHistory.user_id = receiver.user_id;
            receiverBalanceHistory.balance = receiver.balance_cash;
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
            await this.databaseService.startTransaction();
            const body = {
                bank_id: request.body.bank_id,
                amount: parseInt(request.body.amount),
                account: request.body.account,
                note: request.body.note,
            };
            let user: User = (<any>request).user;
        
            if (body.amount <= 0) {
                throw new BadRequest('Amount should be more than 0. Given: ' + body.amount + '.');
            }

            let transaction = new Transaction();
            transaction.target_id = body.account;
            transaction.amount = body.amount;
            transaction.target_type = TargetType.BANK;
            transaction.user_id = user.user_id;
            transaction.flow = FlowType.OUTGOING;
            transaction.note = body.note;
            transaction.wallet_type = WalletType.CASH;

            user.balance_cash = user.balance_cash - body.amount;

            const results = await Promise.all([
                this.manager.save(transaction),
                this.manager.save(user),
            ])

            transaction = results[0];
            user = results[1];

            let balanceHistory = new BalanceHistory();
            balanceHistory.user_id = user.user_id;
            balanceHistory.balance = user.balance_cash;
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

    @Post('/transfer/bank/confirm')
    @ValidateRequest({
        body: ['bank_id, account, amount'],
        useTrim: true,
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async transferBankConfirm(@Req() request): Promise<{ bankAccount: BankAccount, transaction: Transaction }> {
        try {
            await this.databaseService.startTransaction();
            const body = {
                bank_id: request.body.bank_id,
                amount: parseInt(request.body.amount),
                account: request.body.account,
                note: request.body.note,
            };
            if (body.amount <= 0) {
                throw new BadRequest('Amount should be more than 0. Given: ' + body.amount + '.');
            }
            const numericRegExp = new RegExp(/^[0-9]+$/);
            if (body.account.length < 9 || !numericRegExp.test(body.account)) {
                throw new BadRequest('Bank account minimal length is 9 numerical character.')
            }

            let user: User = (<any>request).user;
            let bankAccount = new BankAccount();
            bankAccount.account_number = body.account;
            bankAccount.name = 'Silvia Yustika';
            bankAccount.bank = BankType.BCA;
            await this.manager.save(bankAccount);

            let transaction = new Transaction ();
            transaction.target_id = body.account;
            transaction.amount = body.amount;
            transaction.target_type = TargetType.BANK;
            transaction.user_id = user.user_id;
            transaction.flow = FlowType.OUTGOING;
            transaction.note = body.note;
            transaction.wallet_type = WalletType.CASH;

            // ?

            await this.databaseService.commit();
            return {
                bankAccount: bankAccount,
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
            await this.databaseService.startTransaction();
            const body = {
                amount: parseInt(request.body.amount),
            };
            if (body.amount <= 0) {
                throw new BadRequest('Amount should be more than 0. Given: ' + body.amount + '.');
            }
            let user: User = (<any>request).user;
            // ?
            let bank_account = '123456';
            let transaction = new Transaction(); 
            transaction.target_id = bank_account;
            transaction.amount = body.amount;
            transaction.flow = FlowType.INCOMING;
            transaction.target_type = TargetType.BANK;
            transaction.user_id = user.user_id;
            transaction.wallet_type = WalletType.CASH;

            user.balance_cash = user.balance_cash + body.amount;

            const results = await Promise.all([
                this.manager.save(transaction),
                this.manager.save(user),
            ])

            transaction = results[0];
            user = results[1];

            let balanceHistory = new BalanceHistory();
            balanceHistory.user_id = user.user_id;
            balanceHistory.balance = user.balance_cash;
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

    @Post('/payment/pln/prepaid')
    @ValidateRequest({
        body: ['meter_number', 'amount', 'wallet_type'],
        useTrim: true
    })
    public async prepaidPln(@Req() request): Promise<{ user: User, transaction: Transaction }> {
        try {
            await this.databaseService.startTransaction();
            const body = {
                meter_number: request.body.meter_number,
                amount: parseInt(request.body.amount),
                wallet_type: request.body.wallet_type,
            }
            const numericRegExp = new RegExp(/^[0-9]+$/);
            if (body.meter_number.length < 10 || !numericRegExp.test(body.meter_number)) {
                throw new BadRequest('Input valid meter number')
            }
            if (body.amount <= 0) {
                throw new BadRequest('Amount should be more than 0. Given: ' + body.amount + '.');
            }
            let user: User = (<any>request).user;
            if (body.wallet_type == WalletType.CASH && user.balance_cash < body.amount) {
                throw new BadRequest('You have insufficient OFO Cash');
            }
            else if (body.wallet_type == WalletType.POINT && user.balance_point < body.amount) {
                throw new BadRequest('You have insufficient OFO POINT');
            }

            // ?

            const fee = 2000;
            let transaction = new Transaction();
            transaction.target_id = body.meter_number;
            transaction.amount = body.amount;
            transaction.flow = FlowType.OUTGOING;
            transaction.target_type = TargetType.PAYMENT;
            transaction.user_id = user.user_id;
            transaction.wallet_type = body.wallet_type;
            transaction.fee = fee;
            
            const total = body.amount + fee;
            if (body.wallet_type == WalletType.CASH){
                user.balance_cash = user.balance_cash - total
            } 
            else if (body.wallet_type == WalletType.POINT) {
                user.balance_point = user.balance_point - total
            }

            const results = await Promise.all([
                this.manager.save(transaction),
                this.manager.save(user),
            ])

            transaction = results[0];
            user = results[1];

            let balanceHistory = new BalanceHistory();
            balanceHistory.user_id = user.user_id;
            if (body.wallet_type == WalletType.CASH){
                balanceHistory.balance = user.balance_cash;
                balanceHistory.type = BalanceType.OFO_CASH;
            } else if (body.wallet_type == WalletType.POINT) {
                balanceHistory.balance = user.balance_point;
                balanceHistory.type = BalanceType.OFO_POINT;
            }
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

    @Post('/payment/pln/prepaid/confirm')
    @ValidateRequest({
        body: ['meter_number', 'amount', 'wallet_type'],
        useTrim: true
    })
    public async prepaidPlnConfirm(@Req() request): Promise<{ payment: Payment, transaction: Transaction }> {
        try {
            await this.databaseService.startTransaction();
            const body = {
                meter_number: request.body.meter_number,
                amount: parseInt(request.body.amount),
                wallet_type: request.body.wallet_type,
            }
            const numericRegExp = new RegExp(/^[0-9]+$/);
            if (body.meter_number.length < 10 || !numericRegExp.test(body.meter_number)) {
                throw new BadRequest('Input valid meter number')
            }
            if (body.amount <= 0) {
                throw new BadRequest('Amount should be more than 0. Given: ' + body.amount + '.');
            }
            let user: User = (<any>request).user;
            if (body.wallet_type == WalletType.CASH && user.balance_cash < body.amount) {
                throw new BadRequest('You have insufficient OFO Cash');
            }
            else if (body.wallet_type == WalletType.POINT && user.balance_point < body.amount) {
                throw new BadRequest('You have insufficient OFO POINT');
            }

            // ?

            let payment = new Payment();
            payment.account_number = body.meter_number;

            // ?

            payment.details = 'PT Mentari Agung';
            payment.service = ServiceType.PLN_PREPAID;
            payment = await this.manager.save(payment);

            const fee = 2000;
            let transaction = new Transaction();
            transaction.target_id = body.meter_number;
            transaction.amount = body.amount;
            transaction.flow = FlowType.OUTGOING;
            transaction.target_type = TargetType.PAYMENT;
            transaction.user_id = user.user_id;
            transaction.wallet_type = body.wallet_type;
            transaction.fee = fee;

            await this.databaseService.commit();
            return {
                payment: payment,
                transaction: transaction,
            };

        } catch (error) {
            await this.databaseService.rollback();
        }
    }
    
    @Post('/payment/pln/postpaid/confirm')
    @ValidateRequest({
        body: ['meter_number', 'wallet_type'],
        useTrim: true
    })
    public async postpaidPlnConfirm(@Req() request): Promise<{ payment: Payment, transaction: Transaction }> {
        try {
            await this.databaseService.startTransaction();
            const body = {
                meter_number: request.body.meter_number,
                wallet_type: request.body.wallet_type,
            }
            const numericRegExp = new RegExp(/^[0-9]+$/);
            if (body.meter_number.length < 10 || !numericRegExp.test(body.meter_number)) {
                throw new BadRequest('Input valid meter number')
            }
            let user: User = (<any>request).user;

            let payment = new Payment();
            payment.account_number = body.meter_number;

            // ?

            payment.details = 'PT Mentari Agung';
            payment.service = ServiceType.PLN_POSTPAID;
            payment = await this.manager.save(payment);
            // ?
            let amount = 30000; 
            const fee = 2000;
            let transaction = new Transaction();
            transaction.target_id = body.meter_number;
            transaction.amount = amount;
            transaction.flow = FlowType.OUTGOING;
            transaction.target_type = TargetType.PAYMENT;
            transaction.user_id = user.user_id;
            transaction.wallet_type = body.wallet_type;
            transaction.fee = fee;

            await this.databaseService.commit();
            return {
                payment: payment,
                transaction: transaction,
            };
        } catch (error) {
            await this.databaseService.rollback();
        }
    }

    @Post('/payment/pln/postpaid')
    @ValidateRequest({
        body: ['meter_number', 'wallet_type'],
        useTrim: true
    })
    public async postpaidPln(@Req() request): Promise<{ user: User, transaction: Transaction }> {
        try {
            await this.databaseService.startTransaction();
            const body = {
                meter_number: request.body.meter_number,
                wallet_type: request.body.wallet_type,
            }
            const numericRegExp = new RegExp(/^[0-9]+$/);
            if (body.meter_number.length < 10 || !numericRegExp.test(body.meter_number)) {
                throw new BadRequest('Input valid meter number')
            }
            
            let user: User = (<any>request).user;
            // API ?

            let amount = 20000;
            if (body.wallet_type == WalletType.CASH && user.balance_cash < amount) {
                throw new BadRequest('You have insufficient OFO Cash');
            }
            else if (body.wallet_type == WalletType.POINT && user.balance_point < amount) {
                throw new BadRequest('You have insufficient OFO POINT');
            }

            // ?

            const fee = 2000;
            let transaction = new Transaction();
            transaction.target_id = body.meter_number;
            transaction.amount = amount;
            transaction.flow = FlowType.OUTGOING;
            transaction.target_type = TargetType.PAYMENT;
            transaction.user_id = user.user_id;
            transaction.wallet_type = body.wallet_type;
            transaction.fee = fee;
            
            const total = amount + fee;
            if (body.wallet_type == WalletType.CASH){
                user.balance_cash = user.balance_cash - total
            } 
            else if (body.wallet_type == WalletType.POINT) {
                user.balance_point = user.balance_point - total
            }

            const results = await Promise.all([
                this.manager.save(transaction),
                this.manager.save(user),
            ])

            transaction = results[0];
            user = results[1];

            let balanceHistory = new BalanceHistory();
            balanceHistory.user_id = user.user_id;
            if (body.wallet_type == WalletType.CASH){
                balanceHistory.balance = user.balance_cash;
                balanceHistory.type = BalanceType.OFO_CASH;
            } else if (body.wallet_type == WalletType.POINT) {
                balanceHistory.balance = user.balance_point;
                balanceHistory.type = BalanceType.OFO_POINT;
            }
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
}