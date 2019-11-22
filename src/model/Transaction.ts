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

import uuid from 'uuid';
import { Default, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique } from 'typeorm';
import { WalletType } from './WalletHistory';

export enum FlowType {
    INCOMING='INCOMING',
    OUTGOING='OUTGOING',
}

export enum TargetType {
    USER='USER',
    BANK='BANK',
    PAYMENT='PAYMENT',
}

@Entity()
@Unique(['transaction_id'])
export class Transaction {

    @PrimaryColumn({ length: 36 })
    @Default(uuid.v1())
    transaction_id: string = uuid.v1();

    @Column({ length: 36 })
    @Required()
    user_id: string;

    @Column()
    @Required()
    amount: number;

    @Column()
    @Required()
    @Default(0)
    fee: number = 0;

    @Column({ length: 255 })
    @Required()
    wallet_type: WalletType;

    @Column({ length: 255 })
    @Required()
    target_type: TargetType;

    @Column({ length: 255 })
    @Required()
	target_id: string;

    @Column({ length: 36 })
    @Required()
    flow: FlowType;

    @Column({ length: 20 })
    @Default('')
    note: string = '';

    @CreateDateColumn({ type: 'timestamp' })
    @Property()
    created_at: Date;

}
