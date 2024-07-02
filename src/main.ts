import {run} from '@subsquid/batch-processor'
import {augmentBlock, Block} from '@subsquid/fuel-objects'
import {DataHandlerContext, DataSourceBuilder} from '@subsquid/fuel-stream'
import {Store, TypeormDatabase} from '@subsquid/typeorm-store'
import {OrderbookAbi} from './OrderbookAbi'
//import { Contract } from "./model";
import {assertNotNull} from '@subsquid/util-internal'
import {_abi} from './OrderbookAbi__factory'
import {transcode} from 'buffer'
import crypto from 'crypto'

import {
    BN,
    Contract,
    getDecodedLogs,
    JsonAbi,
    Provider,
    ReceiptLogData,
    ReceiptType,
    TransactionResultReceipt,
} from 'fuels'
import {OrderbookAbi__factory} from './OrderbookAbi__factory'
import {decode} from 'punycode'
import {
    Order,
    OrderType,
    OpenOrderEvent,
    CancelOrderEvent,
    MatchOrderEvent,
    TradeOrderEvent,
    OrderStatus,
    Balance,
    DepositEvent,
    WithdrawEvent,
} from './model'
import isEvent from './utils/isEvent'
import tai64ToDate from './utils/tai64ToDate'
const ORDERBOOK_ID = '0x08ca18ed550d6229f001641d43aac58e00f9eb7e25c9bea6d33716af61e43b2a'

let abi = _abi as JsonAbi
// First we create a DataSource - component,
// that defines where to get the data and what data should we get.
const dataSource = new DataSourceBuilder()
    // Provide Subsquid Network Gateway URL.
    .setGateway('https://v2.archive.subsquid.io/network/fuel-testnet')
    // Subsquid Network is always about 10000 blocks behind the head.
    // We must use regular GraphQL endpoint to get through the last mile
    // and stay on top of the chain.
    // This is a limitation, and we promise to lift it in the future!
    .setGraphql({
        url: 'https://testnet.fuel.network/v1/graphql',
        strideConcurrency: 3,
        strideSize: 50,
    })

    .setFields({
        receipt: {
            contract: true,
            receiptType: true,
            data: true,
            is: true,
            len: true,
            pc: true,
            ptr: true,
            ra: true,
            rb: true,
            digest: true,
        },
        transaction: {
            status: true,
            hash: true,
        },
        block: {
            time: true,
        },
    })
    .setBlockRange({
        from: 0,
    })

    .addReceipt({
        type: ['LOG_DATA'],
        transaction: true,
        contract: ['0x08ca18ed550d6229f001641d43aac58e00f9eb7e25c9bea6d33716af61e43b2a'],
    })

    .build()

const database = new TypeormDatabase()

// Now we are ready to start data processing
run(dataSource, database, async (ctx) => {
    // Block items that we get from `ctx.blocks` are flat JS objects.
    //
    // We can use `augmentBlock()` function from `@subsquid/fuel-objects`
    // to enrich block items with references to related objects.
    let contracts: Map<String, Contract> = new Map()
    let blocks = ctx.blocks.map(augmentBlock)

    for (let block of blocks) {
        let orders: Map<string, Order> = new Map()
        let tradeOrderEvents: Map<string, TradeOrderEvent> = new Map()
        let matchOrderEvents: Map<string, MatchOrderEvent> = new Map()
        let openOrderEvents: Map<string, OpenOrderEvent> = new Map()
        let cancelOrderEvents: Map<string, CancelOrderEvent> = new Map()
        let depositEvents: Map<string, DepositEvent> = new Map()
        let withdrawEvents: Map<string, WithdrawEvent> = new Map()
        let balances: Map<string, Balance> = new Map()
        const receipts: (ReceiptLogData & {data: string})[] = []
        for (let receipt of block.receipts) {
            if (receipt.contract == ORDERBOOK_ID && receipt.transaction?.status.type != 'FailureStatus') {
                receipts.push({
                    type: ReceiptType.LogData,
                    digest: assertNotNull(receipt.digest),
                    id: receipt.contract,
                    is: new BN(receipt.is?.toString()),
                    len: new BN(receipt.len?.toString()),
                    pc: new BN(receipt.pc?.toString()),
                    ptr: new BN(receipt.ptr?.toString()),
                    val0: new BN(receipt.ra?.toString()),
                    val1: new BN(receipt.rb?.toString()),
                    data: assertNotNull(receipt.data),
                })
            }
        }

        let logs: any[] = getDecodedLogs(receipts, abi)

        // let createEvents: SpotMarketCreateEvent[] = [];
        for (let log of logs) {
            if (isEvent('TradeOrderEvent', log, abi)) {
                //console.log('LOG', log)
                const idSource = `${log.base_sell_order_id}-${log.base_buy_order_id}-${
                    log.order_matcher.Address.bits
                }-${log.trade_size}-${log.trade_price}-${log.tx_id}-${Math.random()}`
                const id = crypto.createHash('sha256').update(idSource).digest('hex')

                let sellOrder = orders.get(log.sell_order_id)
                if (!sellOrder) {
                    sellOrder = await ctx.store.get(Order, {where: {id: log.sell_order_id}})
                }

                let buyOrder = orders.get(log.buy_order_id)
                if (!buyOrder) {
                    buyOrder = await ctx.store.get(Order, {where: {id: log.buy_order_id}})
                }

                let event = new TradeOrderEvent({
                    id: id,
                    baseSellOrderId: log.base_sell_order_id,
                    baseBuyOrderId: log.base_buy_order_id,
                    txId: log.tx_id,
                    orderMatcher: log.order_matcher.Address.bits,
                    tradeSize: BigInt(log.trade_size),
                    tradePrice: BigInt(log.trade_price),
                    timestamp: block.header.time.toString(),
                })
                tradeOrderEvents.set(event.id, event)
            }

            if (
                isEvent('OpenOrderEvent', log, abi) ||
                isEvent('CancelOrderEvent', log, abi) ||
                isEvent('MatchOrderEvent', log, abi)
            ) {
                const eventType = isEvent('OpenOrderEvent', log, abi)
                    ? 'OpenOrderEvent'
                    : isEvent('CancelOrderEvent', log, abi)
                    ? 'CancelOrderEvent'
                    : 'MatchOrderEvent'
                const eventOrder = log.order
                //const timestamp = tai64ToDate(log.timestamp)
                // console.log(eventType)
                // console.log('CHANGE', log)
                let timestamp = '0'
                const order: Order | null = eventOrder
                    ? new Order({
                          id: eventOrder.id,
                          amount: BigInt(eventOrder.amount),
                          assetType: eventOrder.asset_type,
                          price: BigInt(eventOrder.price),
                          orderType: eventOrder.order_type,
                          timestamp: block.header.time.toString(), // adjust this
                          user: eventOrder.user.Address.bits,
                          initialAmount: 0n,
                          status:
                              eventOrder.amount === 0n
                                  ? OrderStatus.Canceled
                                  : eventOrder.base_size.negative
                                  ? OrderStatus.Active
                                  : OrderStatus.Closed, // adjust this
                      })
                    : null
                let newAmount = order ? order.amount : '0'
                const idSource = `${log.tx_id}-${timestamp}-${log.order_id}-${newAmount}-${Math.random()}`
                const id = crypto.createHash('sha256').update(idSource).digest('hex')

                let maybeExistingOrder = orders.get(log.order_id)
                if (!maybeExistingOrder) {
                    maybeExistingOrder = await ctx.store.findOne(Order, {
                        where: {id: log.order_id},
                    })
                }
                if (order) {
                    if (!maybeExistingOrder || maybeExistingOrder.orderType !== null) {
                        orders.set(order.id, order)
                    }
                }

                if (
                    maybeExistingOrder &&
                    maybeExistingOrder.status !== OrderStatus.Canceled &&
                    maybeExistingOrder.status !== OrderStatus.Closed
                ) {
                    let ammendedOrder = new Order({
                        id: maybeExistingOrder.id,
                        amount: maybeExistingOrder.amount,
                        assetType: maybeExistingOrder.assetType,
                        price: maybeExistingOrder.price,
                        orderType: maybeExistingOrder.orderType,
                        timestamp: maybeExistingOrder.timestamp,
                        user: maybeExistingOrder.user,
                        initialAmount: 0n,
                        status:
                            eventOrder.amount === 0n
                                ? OrderStatus.Canceled
                                : eventOrder.base_size.negative
                                ? OrderStatus.Active
                                : OrderStatus.Closed, // adjust this
                    })

                    orders.set(ammendedOrder.id, ammendedOrder)
                }
                let evOrder = orders.get(log.order_id)

                if (eventType === 'OpenOrderEvent' && evOrder) {
                    console.log('OPEN', log)
                    const newOpenOrderEvent: OpenOrderEvent = new OpenOrderEvent({
                        id: id,
                        orderId: evOrder.id, //order ? order : maybeExistingOrder,
                        txId: log.tx_id,
                        asset: log.amount,
                        assetType: evOrder.assetType,
                        orderType: evOrder.orderType,
                        price: evOrder.price,
                        user: evOrder.user,
                        timestamp: evOrder.timestamp,
                    })

                    openOrderEvents.set(newOpenOrderEvent.id, newOpenOrderEvent)
                } else if (eventType === 'CancelOrderEvent' && evOrder) {
                    console.log('CANCEL', log)
                    const newCancelOrderEvent: CancelOrderEvent = new CancelOrderEvent({
                        id: id,
                        orderId: evOrder.id, //order ? order : maybeExistingOrder,
                        txId: log.tx_id,
                        timestamp: evOrder.timestamp,
                    })
                    cancelOrderEvents.set(newCancelOrderEvent.id, newCancelOrderEvent)
                } else if (eventType === 'MatchOrderEvent' && evOrder) {
                    console.log('MATCH', log)
                    const newMatchOrderEvent: MatchOrderEvent = new MatchOrderEvent({
                        id: id,
                        orderId: evOrder.id, //order ? order : maybeExistingOrder,
                        txId: log.tx_id,
                        asset: log.amount,
                        orderMatcher: log.order_matcher.Address.bits,
                        owner: log.owner.Address.bits,
                        counterparty: log.counterparty.Address.bits,
                        matchSize: BigInt(log.match_size),
                        matchPrice: BigInt(log.match_price),
                        timestamp: evOrder.timestamp,
                    })
                    matchOrderEvents.set(newMatchOrderEvent.id, newMatchOrderEvent)
                }
            }
            if (isEvent('DepositEvent', log, abi)) {
                let idSource = `$${log.user.Address.bits}-${log.asset.bits}`
                const balanceId = crypto.createHash('sha256').update(idSource).digest('hex')
                let balance = balances.get(log.user.Address.bits)
                if (!balance) {
                    balance = await ctx.store.get(Balance, {where: {id: balanceId}})
                }
                if (!balance) {
                    balance = new Balance({
                        id: balanceId,
                        user: log.user.Address.bits,
                        amount: BigInt(0),
                        asset: log.asset.bits,
                    })
                }
                balance.amount = balance.amount + BigInt(log.amount)
                balances.set(balance.id, balance)
                let eventIdSource = `${log.tx_id}-${log.user.Address.bits}-${log.asset.bits}-${Math.random()}`
                const eventId = crypto.createHash('sha256').update(eventIdSource).digest('hex')
                let depositEvent = new DepositEvent({
                    id: eventId,
                    txId: '0x',
                    amount: BigInt(log.amount),
                    asset: log.asset.bits,
                    user: log.user.Address.bits,
                    timestamp: block.header.time.toString(), // adjust this
                })
                depositEvents.set(depositEvent.id, depositEvent)
            }
            if (isEvent('WithdrawEvent', log, abi)) {
                let idSource = `$${log.user.Address.bits}-${log.asset.bits}`
                const balanceId = crypto.createHash('sha256').update(idSource).digest('hex')

                let eventIdSource = `${log.tx_id}-${log.user.Address.bits}-${log.asset.bits}-${Math.random()}`
                const eventId = crypto.createHash('sha256').update(eventIdSource).digest('hex')
                let balance = balances.get(balanceId)
                if (!balance) {
                    balance = await ctx.store.get(Balance, {where: {id: balanceId}})
                }

                if (balance) {
                    balance.amount = balance.amount - BigInt(log.amount)
                    balances.set(balance.id, balance)
                }
                let withdrawEvent = new WithdrawEvent({
                    id: eventId,
                    txId: '0x',
                    amount: BigInt(log.amount),
                    asset: log.asset.bits,
                    user: log.user.Address.bits,
                    timestamp: block.header.time.toString(), // adjust this
                })
                withdrawEvents.set(withdrawEvent.id, withdrawEvent)
            }
        }

        await ctx.store.upsert([...orders.values()])
        // await ctx.store.save([...orderMatchEvents.values()])
        // await ctx.store.save([...marketCreateEvents.values()])
        await ctx.store.save([...tradeOrderEvents.values()])
        await ctx.store.save([...openOrderEvents.values()])
        await ctx.store.save([...cancelOrderEvents.values()])
        await ctx.store.save([...matchOrderEvents.values()])
        await ctx.store.save([...depositEvents.values()])
        await ctx.store.save([...withdrawEvents.values()])
        await ctx.store.save([...balances.values()])
    }
})

function processOrder(log: any) {
    let order = log.order
    if (!order) {
        return new Order({
            id: log.order_id,
            // orderType: null,
            // trader: '0x-',
            // baseToken: '0x-',
            // baseSize: '0',
            // basePrice: BigInt(0),
            timestamp: tai64ToDate(log.timestamp).toString(),
        })
    }
    return new Order({
        id: log.order_id,
        // trader: order.trader.bits,
        // baseToken: order.base_token.bits,
        // baseSize: decodeI64(order.base_size),
        // basePrice: BigInt(order.base_price),
        timestamp: tai64ToDate(log.timestamp).toString(),
        orderType: order.base_size.value === 0n ? undefined : order.base_size.negative ? OrderType.Sell : OrderType.Buy,
    })
}

function processOrderOpenEvent(log: any, order: Order) {
    //("Order Open Event", log);
    const timestamp = tai64ToDate(log.timestamp)
    const idSource = `${log.tx_id}-${timestamp}-${log.order_id}`
    const id = crypto.createHash('sha256').update(idSource).digest('hex')
    let event = new OpenOrderEvent({
        id: id,
        // newBaseSize: order.baseSize,
        // identifier: 'OrderOpenEvent',
        timestamp: tai64ToDate(log.timestamp).toString(),
        // order: order,
        txId: log.tx_id,
    })
    return event
}

function createCancelledOrder(log: any) {
    return new Order({
        id: log.order_id,
        // orderType: null,
        // trader: '0x-',
        // baseToken: '0x-',
        // baseSize: '0',
        // basePrice: BigInt(0),
        timestamp: tai64ToDate(log.timestamp).toString(),
    })
}

function processOrderCancelEvent(log: any, order: Order) {
    const timestamp = tai64ToDate(log.timestamp)
    const idSource = `${log.tx_id}-${timestamp}-${log.order_id}`
    const id = crypto.createHash('sha256').update(idSource).digest('hex')
    let event = new CancelOrderEvent({
        id: id,
        // newBaseSize: order.baseSize,
        // identifier: 'OrderCancelEvent',
        timestamp: tai64ToDate(log.timestamp).toString(),
        // order: order,
        txId: log.tx_id,
    })
    return event
}

function processOrderMatchEvent(log: any, order: Order) {
    //console.log("Order Match Event", log);
    const timestamp = tai64ToDate(log.timestamp)
    const idSource = `${log.tx_id}-${timestamp}-${log.order_id}`
    const id = crypto.createHash('sha256').update(idSource).digest('hex')
    let event = new MatchOrderEvent({
        id: id,
        // newBaseSize: order.baseSize,
        // identifier: 'OrderCancelEvent',
        timestamp: tai64ToDate(log.timestamp).toString(),
        // order: order,
        txId: log.tx_id,
    })
    return event
}

function decodeI64(i64: {readonly value: bigint; readonly negative: boolean}) {
    return (i64.negative ? '-' : '') + i64.value.toString()
}

async function lookUpOrder(store: Store, orders: Map<string, Order>, id: string) {
    let order = orders.get(id)
    if (!order) {
        order = await store.get(Order, id)
    }
    return order
}
