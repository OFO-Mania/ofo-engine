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


import axios from 'axios';
import { BodyParams, Controller, Get, Post, Req, UseAuth } from '@tsed/common';
import { Docs } from '@tsed/swagger';
import { BadRequest } from 'ts-httpexceptions';
import { EntityManager } from 'typeorm';

import { ValidateRequest } from '../../../decorators/ValidateRequestDecorator';
import { UserAuthenticationMiddleware } from '../../../middlewares/UserAuthenticationMiddleware';
import { DatabaseService } from '../../../services/DatabaseService';
import { PushNotificationService } from '../../../services/PushNotificationService';
import { BankAccount, BankType } from '../../../model/BankAccount';
import { Payment, ServiceType } from '../../../model/Payment';
import { FlowType, TargetType, Transaction } from '../../../model/Transaction';
import { User } from '../../../model/User';
import { WalletHistory, WalletType } from '../../../model/WalletHistory';
import { MobilePulsaConfig } from '../../../config/mobilepulsa.config';
import uuid from 'uuid';
import { Device } from '../../../model/Device';

@Controller('/transaction')
@Docs('api-v1')
export class TransactionController {
    private manager: EntityManager;

    constructor(
        private databaseService: DatabaseService,
        private pushNotificationService: PushNotificationService
    ) { }

    public $afterRoutesInit(): void {
        this.manager = this.databaseService.getManager();
    }

    private static genereteRandomAccountNumber(): string {
        const availableCharacters = '0123456789';
        const otp = [];
        for (let i = 0; i < 10; i++) {
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

    private static generateRandomBoolean(): boolean {
        return Math.random() >= 0.5;
    }

    @Get('/history')
    @UseAuth(UserAuthenticationMiddleware)
    public async getTransactionHistory(@Req() request): Promise<{ transactions: Transaction[] }> {
        const user: User = (<any>request).user;
        const transactions = await this.manager.find(Transaction, {
            user_id: user.user_id
        });
        return { transactions };
    }

    @Post('/transfer/user/inquiry')
    @ValidateRequest({
        body: ['phone_number'],
        useTrim: true
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async inquiryTransferToUser(@Req() request: Req): Promise<{ target: User }> {
        const body = {
            phone_number: request.body.phone_number,
        };
        if (body.phone_number.startsWith('0')) {
            body.phone_number = '62'.concat(body.phone_number.substring(1));
        }
        if (body.phone_number.startsWith('62')) {
            body.phone_number = '+'.concat(body.phone_number);
        }
        let receiver = await this.manager.findOne(User, {
            phone_number: body.phone_number,
        });
        if (typeof receiver === 'undefined') {
            throw new BadRequest(`Receiver phone number ${body.phone_number} is not a registered user.`);
        }
        receiver.full_name = receiver.full_name.split(' ').map(nameByWord => (
            nameByWord.split('').map((char, index) => (
                index === 0 || index === 1 || index === nameByWord.length - 1
                    ? char : '*'
            )).join('')
        )).join(' ');
        return { target: receiver }
    }

    @Post('/transfer/user/confirm')
    @ValidateRequest({
        body: ['phone_number', 'amount'],
        useTrim: true
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async confirmTransferToUser(@Req() request: Req): Promise<{
        user: User,
        transaction: Transaction
        target: User
    }> {
        try {
            await this.databaseService.startTransaction();
            const body = {
                phone_number: request.body.phone_number,
                amount: parseInt(request.body.amount),
                note: request.body.note || '',
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
                throw new BadRequest(`Receiver phone number ${body.phone_number} is not a registered user.`);
            }
            const receiverDevices = await this.manager.find(Device, {
                user_id: receiver.user_id
            });
            if (isNaN(body.amount)) {
                throw new BadRequest('Amount should be numeric. Given: ' + body.amount + '.');
            }
            if (body.amount < 1000) {
                throw new BadRequest('Amount should be more than Rp 1.000. Given: ' + body.amount + '.');
            }
            if (body.amount > sender.current_cash) {
                throw new BadRequest('You have insufficient OFO Cash!');
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
            sender.current_cash = sender.current_cash - body.amount;
            //update balance in receiver user
            receiver.current_cash = receiver.current_cash + body.amount;
            const results = await Promise.all([
                this.manager.save(outgoingTransaction),
                this.manager.save(incomingTransaction),
                this.manager.save(sender),
                this.manager.save(receiver),
            ]);
            //defining new results after sending to database
            outgoingTransaction = results[0];
            sender = results[2];
            receiver = results[3];
            //add balance history in sender user
            let senderWalletHistory = new WalletHistory();
            senderWalletHistory.user_id = sender.user_id;
            senderWalletHistory.balance = sender.current_cash;
            senderWalletHistory.type = WalletType.CASH;
            //add balance history in receiver user
            let receiverWalletHistory = new WalletHistory();
            receiverWalletHistory.user_id = receiver.user_id;
            receiverWalletHistory.balance = receiver.current_cash;
            receiverWalletHistory.type = WalletType.CASH;
            await Promise.all([
                this.manager.save(senderWalletHistory),
                this.manager.save(receiverWalletHistory),
            ]);
            await this.databaseService.commit();
            const promises = [];
            for (const device of receiverDevices) {
                promises.push(this.pushNotificationService.sendNotification({
                    title: 'OFO Cash Received',
                    message: `${sender.full_name} send you Rp ${body.amount}`
                }, device.device_id))
            }
            await Promise.all(promises);
            return {
                user: sender,
                transaction: outgoingTransaction,
                target: receiver,
            };
        } catch (error) {
            await this.databaseService.rollback();
            throw error;
        }
    }

    @Post('/transfer/bank/inquiry')
    @ValidateRequest({
        body: ['bank', 'account_number'],
        useTrim: true,
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async inquiryBankTransfer(@Req() request): Promise<{ bankAccount: BankAccount }> {
        try {
            await this.databaseService.startTransaction();
            const body = {
                bank: request.body.bank,
                account_number: request.body.account_number,
                note: request.body.note || '',
            };
            const user: User = <User> (<any>request).user;
            const numericRegExp = new RegExp(/^[0-9]+$/);
            if (body.account_number.length < 5 || !numericRegExp.test(body.account_number)) {
                throw new BadRequest('Account number should be minimal 5 numerical character.')
            }
            const response = await axios.get('https://randomuser.me/api/');
            let bankAccount = new BankAccount();
            bankAccount.account_number = body.account_number;
            bankAccount.bank = body.bank;
            bankAccount.name = response.data.results[0].name.first + ' ' + response.data.results[0].name.last;
            bankAccount = await this.manager.save(bankAccount);
            await this.databaseService.commit();
            return { bankAccount };
        } catch (error) {
            await this.databaseService.rollback();
            throw error;
        }
    }

    @Post('/transfer/bank/confirm')
    @ValidateRequest({
        body: ['bank_account_id', 'amount'],
        useTrim: true,
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async confirmBankTransfer(@Req() request): Promise<{
        user: User,
        transaction: Transaction
        target: BankAccount
    }> {
        try {
            await this.databaseService.startTransaction();
            const body = {
                bank_account_id: request.body.bank_account_id,
                amount: parseInt(request.body.amount),
                note: request.body.note || '',
            };
            let user: User = (<any>request).user;
            if (isNaN(body.amount)) {
                throw new BadRequest('Amount should be numeric. Given: ' + body.amount + '.');
            }
            if (body.amount < 10000) {
                throw new BadRequest('Amount should be more than Rp 10.000. Given: ' + body.amount + '.');
            }
            if (body.amount > user.current_cash) {
                throw new BadRequest('You have insufficient OFO Cash!');
            }
            const bankAccount = await this.manager.findOne(BankAccount, {
                bank_account_id: body.bank_account_id
            });
            if (typeof bankAccount === 'undefined') {
                throw new BadRequest('There is not bank account with the given detail');
            }
            let transaction = new Transaction();
            transaction.amount = body.amount;
            transaction.flow = FlowType.OUTGOING;
            transaction.note = body.note;
            transaction.target_id = bankAccount.bank_account_id;
            transaction.target_type = TargetType.BANK;
            transaction.user_id = user.user_id;
            transaction.wallet_type = WalletType.CASH;
            user.current_cash = user.current_cash = body.amount;
            const result = await Promise.all([
                this.manager.save(transaction),
                this.manager.save(user)
            ]);
            transaction = result[0];
            user = result[1];
            const senderWalletHistory = new WalletHistory();
            senderWalletHistory.balance = user.current_cash;
            senderWalletHistory.type = WalletType.CASH;
            senderWalletHistory.user_id = user.user_id;
            await this.manager.save(senderWalletHistory);
            await this.databaseService.commit();
            return { user, transaction, target: bankAccount };
        } catch (error) {
            await this.databaseService.rollback();
            throw error;
        }
    }

    @Post('/topup/instant')
    @ValidateRequest({
        body: ['amount'],
        useTrim: true
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async instantTopup(@Req() request): Promise<{
        user: User,
        transaction: Transaction
        target: BankAccount
    }> {
        try {
            await this.databaseService.startTransaction();
            const body = {
                amount: parseInt(request.body.amount),
            };
            let user: User = (<any>request).user;
            if (isNaN(body.amount)) {
                throw new BadRequest('Amount should be numeric. Given: ' + body.amount + '.');
            }
            if (body.amount <= 10000) {
                throw new BadRequest('Amount should be more than Rp 10.000. Given: ' + body.amount + '.');
            }
            if (body.amount + user.current_cash > 10000000) {
                throw new BadRequest('Maximum OFO cash you can have is Rp 10.000.000. Given: ' + body.amount + '.');
            }
            if (!TransactionController.generateRandomBoolean()) {
                throw new BadRequest('Your BCA account balance is not enough!');
            }

            let bankAccount = new BankAccount();
            bankAccount.account_number = TransactionController.genereteRandomAccountNumber();
            bankAccount.name = user.full_name;
            bankAccount.bank = BankType.BCA;
            bankAccount = await this.manager.save(bankAccount);

            let transaction = new Transaction();
            transaction.target_id = bankAccount.account_number;
            transaction.amount = body.amount;
            transaction.flow = FlowType.INCOMING;
            transaction.target_type = TargetType.BANK;
            transaction.user_id = user.user_id;
            transaction.wallet_type = WalletType.CASH;
            user.current_cash = user.current_cash + body.amount;
            const results = await Promise.all([
                this.manager.save(transaction),
                this.manager.save(user),
            ]);
            transaction = results[0];
            user = results[1];

            const walletHistory = new WalletHistory();
            walletHistory.user_id = user.user_id;
            walletHistory.balance = user.current_cash;
            walletHistory.type = WalletType.CASH;
            await this.manager.save(walletHistory);

            await this.databaseService.commit();
            return {
                user: user,
                transaction: transaction,
                target: bankAccount
            };
        } catch (error) {
            await this.databaseService.rollback();
            throw error;
        }
    }

    @Post('/payment/pln/prepaid/inquiry')
    @ValidateRequest({
        body: ['meter_number'],
        useTrim: true
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async inquiryPlnPrepaidPayment(
        @BodyParams('meter_number') meter_number: string
    ): Promise<PLNPrepaidInquiryResponse> {
        const numericRegExp = new RegExp(/^[0-9]+$/);
        if (meter_number.length < 9 || !numericRegExp.test(meter_number)) {
            throw new BadRequest('Valid meter number should be minimal 9 numerical character.');
        }
        const response = await axios.post<PLNPrepaidSubscriptionData>('https://testprepaid.mobilepulsa.net/v1/legacy/index', {
            commands : 'inquiry_pln',
            username : MobilePulsaConfig.username,
            hp       : meter_number,
            sign     : MobilePulsaConfig.generateSignature(meter_number)
        }, {
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });
        const { data } = response.data;
        if (data.status === 2) {
            throw new BadRequest(data.message);
        }
        return {
            customer_id: data.hp,
            meter_number: data.meter_no,
            subscriber_id: data.subscriber_id,
            full_name: data.name,
            segment_power: data.segment_power
        }
    }

    @Post('/payment/pln/prepaid/confirm')
    @ValidateRequest({
        body: ['meter_number', 'amount', 'wallet_type'],
        useTrim: true
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async confirmPlnPrepaidPayment(
        @BodyParams('meter_number') meter_number: string,
        @BodyParams('amount') amount: number,
        @BodyParams('wallet_type') wallet_type: WalletType,
        @Req() request: Req
    ): Promise<{
        user: User,
        transaction: Transaction,
        target: Payment
    }> {
        try {
            await this.databaseService.startTransaction();
            const numericRegExp = new RegExp(/^[0-9]+$/);
            if (meter_number.length < 9 || !numericRegExp.test(meter_number)) {
                throw new BadRequest('Valid meter number should be minimal 9 numerical character.');
            }
            amount = parseInt(<string><unknown>amount);
            if (isNaN(amount)) {
                throw new BadRequest('Amount should be numeric. Given: ' + amount + '.');
            }
            if (amount <= 0) {
                throw new BadRequest('Amount should be more than 0. Given: ' + amount + '.');
            }
            let user: User = (<any>request).user;
            // @ts-ignore
            if (wallet_type !== WalletType.CASH && wallet_type !== WalletType.CASH ){
                throw new BadRequest('Wallet Type should be "CASH" or "POINT"');
            }
            if (wallet_type === WalletType.CASH && user.current_cash < amount) {
                throw new BadRequest('You have insufficient OFO Cash!');
            }
            else if (wallet_type === WalletType.POINT && user.current_point < amount) {
                throw new BadRequest('You have insufficient OFO Point!');
            }
            const response = await axios.post<PLNPrepaidSubscriptionData>('https://testprepaid.mobilepulsa.net/v1/legacy/index', {
                commands : 'inquiry_pln',
                username : MobilePulsaConfig.username,
                hp       : meter_number,
                sign     : MobilePulsaConfig.generateSignature(meter_number)
            }, {
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
            });
            const { data } = response.data;
            if (data.status === 2) {
                throw new BadRequest(data.message);
            }
            let payment = new Payment();
            payment.account_number = meter_number;
            payment.details = JSON.stringify(data);
            payment.service = ServiceType.PLN_PREPAID;
            payment = await this.manager.save(payment);

            let transaction = new Transaction();
            transaction.target_id = payment.payment_id;
            transaction.amount = amount;
            transaction.flow = FlowType.OUTGOING;
            transaction.target_type = TargetType.PAYMENT;
            transaction.user_id = user.user_id;
            transaction.wallet_type = wallet_type;
            transaction.fee = 2000;

            const total = transaction.amount + transaction.fee;
            if (wallet_type === WalletType.CASH){
                user.current_cash = user.current_cash - total
            } else if (wallet_type === WalletType.POINT) {
                user.current_point = user.current_point - total
            }
            const results = await Promise.all([
                this.manager.save(transaction),
                this.manager.save(user),
            ]);
            transaction = results[0];
            user = results[1];
            let walletHistory = new WalletHistory();
            walletHistory.user_id = user.user_id;
            walletHistory.balance = wallet_type === WalletType.CASH ? user.current_cash : user.current_point;
            walletHistory.type = wallet_type;
            await this.manager.save(walletHistory);
            await this.databaseService.commit();
            return {
                user: user,
                transaction: transaction,
                target: payment
            };
        } catch (error) {
            await this.databaseService.rollback();
            throw error;
        }
    }

    @Post('/payment/pln/postpaid/inquiry')
    @ValidateRequest({
        body: ['customer_id'],
        useTrim: true
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async inquiryPlnPostpaidPayment(
        @BodyParams('customer_id') customer_id: string,
        @Req() request: Req
    ): Promise<PLNPostpaidInquiryResponse> {
        const numericRegExp = new RegExp(/^[0-9]+$/);
        if (customer_id.length < 9 || !numericRegExp.test(customer_id)) {
            throw new BadRequest('Valid customer ID should be minimal 9 numerical character.');
        }
        const reference_id = uuid.v1();
        const response = await axios.post<PLNPostpaidSubscriptionData>('https://testpostpaid.mobilepulsa.net/api/v1/bill/check', {
            commands: 'inq-pasca',
            username: MobilePulsaConfig.username,
            code: 'PLNPOSTPAID',
            hp: customer_id,
            ref_id: reference_id,
            sign: MobilePulsaConfig.generateSignature(reference_id)
        }, {
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });
        const { data } = response.data;
        return {
            customer_id: data.hp,
            meter_number: data.tr_id.toString(),
            subscriber_id: customer_id,
            full_name: data.tr_name,
            segment_power: data.desc.tarif + '/' + data.desc.daya,
            amount: data.price
        }
    }

    @Post('/payment/pln/postpaid/confirm')
    @ValidateRequest({
        body: ['customer_id', 'wallet_type'],
        useTrim: true
    })
    @UseAuth(UserAuthenticationMiddleware)
    public async confirmPlnPostpaidPayment(
        @BodyParams('customer_id') customer_id: string,
        @BodyParams('wallet_type') wallet_type: WalletType,
        @Req() request: Req
    ): Promise<{
        user: User,
        transaction: Transaction,
        target: Payment
    }> {
        try {
            await this.databaseService.startTransaction();
            const numericRegExp = new RegExp(/^[0-9]+$/);
            if (customer_id.length < 9 || !numericRegExp.test(customer_id)) {
                throw new BadRequest('Valid customer ID should be minimal 9 numerical character.');
            }
            let user: User = (<any>request).user;
            const reference_id = uuid.v1();
            const response = await axios.post<PLNPostpaidSubscriptionData>('https://testpostpaid.mobilepulsa.net/api/v1/bill/check', {
                commands: 'inq-pasca',
                username: MobilePulsaConfig.username,
                code: 'PLNPOSTPAID',
                hp: customer_id,
                ref_id: reference_id,
                sign: MobilePulsaConfig.generateSignature(reference_id)
            }, {
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
            });
            const { data } = response.data;
            // @ts-ignore
            if (wallet_type !== WalletType.CASH && wallet_type !== WalletType.CASH ){
                throw new BadRequest('Wallet Type should be "CASH" or "POINT"');
            }
            if (wallet_type === WalletType.CASH && user.current_cash < data.price) {
                throw new BadRequest('You have insufficient OFO Cash!');
            }
            else if (wallet_type === WalletType.POINT && user.current_point < data.price) {
                throw new BadRequest('You have insufficient OFO Point!');
            }

            let payment = new Payment();
            payment.account_number = customer_id;
            payment.details = JSON.stringify(data);
            payment.service = ServiceType.PLN_POSTPAID;
            payment = await this.manager.save(payment);

            let transaction = new Transaction();
            transaction.target_id = payment.payment_id;
            transaction.amount = data.price;
            transaction.flow = FlowType.OUTGOING;
            transaction.target_type = TargetType.PAYMENT;
            transaction.user_id = user.user_id;
            transaction.wallet_type = wallet_type;
            transaction.fee = 2000;

            const total = transaction.amount + transaction.fee;
            if (wallet_type === WalletType.CASH){
                user.current_cash = user.current_cash - total
            } else if (wallet_type === WalletType.POINT) {
                user.current_point = user.current_point - total
            }
            const results = await Promise.all([
                this.manager.save(transaction),
                this.manager.save(user),
            ]);
            transaction = results[0];
            user = results[1];
            let walletHistory = new WalletHistory();
            walletHistory.user_id = user.user_id;
            walletHistory.balance = wallet_type === WalletType.CASH ? user.current_cash : user.current_point;
            walletHistory.type = wallet_type;
            await this.manager.save(walletHistory);
            await this.databaseService.commit();
            return {
                user: user,
                transaction: transaction,
                target: payment
            };
        } catch (error) {
            await this.databaseService.rollback();
            throw error;
        }
    }
}

type PLNPrepaidSubscriptionData = {
    data: {
        status: number,
        hp: string,
        meter_no: string,
        subscriber_id: string,
        name: string,
        segment_power: string,
        message: string,
        rc: string
    }
}

type PLNPostpaidSubscriptionData = {
    data: {
        status: number,
        tr_id: number,
        code: string,
        hp: string,
        tr_name: string
        period: string,
        nominal: number,
        admin: number,
        ref_id: string,
        response_code: string
        message: string
        price: number,
        selling_price: number,
        desc: {
            tarif: string,
            daya: number,
            lembar_tagihan: string,
            tagihan: {
                detail: [
                    {
                        periode: string,
                        nilai_tagihan: string,
                        admin: string,
                        denda: string,
                        total: number
                    }
                ]
            }
        }
    },
    meta: []
};

type PLNPrepaidInquiryResponse = {
    customer_id: string,
    meter_number: string,
    subscriber_id: string,
    full_name: string,
    segment_power: string
};


type PLNPostpaidInquiryResponse = {
    customer_id: string,
    meter_number: string,
    subscriber_id: string,
    full_name: string,
    segment_power: string,
    amount: number
};
