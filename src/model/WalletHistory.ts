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

import { Default, Property, Required, } from '@tsed/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique } from 'typeorm';
import uuid from 'uuid';

export enum WalletType {
    CASH='CASH',
    POINT='POINT',
}

@Entity()
@Unique(['balance_history_id'])
export class WalletHistory {

    @PrimaryColumn({ length: 36 })
    @Default(uuid.v1())
    wallet_history_id: string = uuid.v1();

    @Column({ length: 36 })
    @Required()
    user_id: string;

    @Column({ length: 255 })
    @Required()
    type: WalletType;

    @Column()
    @Required()
    balance: number;

    @CreateDateColumn({ type: 'timestamp' })
    @Property()
    created_at: Date;
}
