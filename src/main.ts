import { run } from '@subsquid/batch-processor'
import { augmentBlock, Block } from '@subsquid/fuel-objects'
import { DataHandlerContext, DataSourceBuilder } from '@subsquid/fuel-stream'
import { Store, TypeormDatabase } from '@subsquid/typeorm-store'
import { OrderbookAbi } from './OrderbookAbi'
//import { Contract } from "./model";
import { assertNotNull } from '@subsquid/util-internal'
import { _abi } from './OrderbookAbi__factory'
import { transcode } from 'buffer'
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
import { OrderbookAbi__factory } from './OrderbookAbi__factory'
import { decode } from 'punycode'
import { Order, OrderType, OpenOrderEvent, CancelOrderEvent, MatchOrderEvent, TradeOrderEvent } from './model'
import isEvent from './utils/isEvent'
import tai64ToDate from './utils/tai64ToDate'
const ORDERBOOK_ID = '0x4a2ce054e3e94155f7092f7365b212f7f45105b74819c623744ebcc5d065c6ac'

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
    })
    .setBlockRange({
        from: 0,
    })

    .addReceipt({
        type: ['LOG_DATA'],
        transaction: true,
        contract: ['0x4a2ce054e3e94155f7092f7365b212f7f45105b74819c623744ebcc5d065c6ac'],
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
    let orders: Map<string, Order> = new Map()
    let tradeOrderEvents: Map<string, TradeOrderEvent> = new Map()
    let matchOrderEvents: Map<string, MatchOrderEvent> = new Map()
    let openOrderEvents: Map<string, OpenOrderEvent> = new Map()
    let cancelOrderEvents: Map<string, CancelOrderEvent> = new Map()
    const receipts: (ReceiptLogData & { data: string })[] = []
    for (let block of blocks) {
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
    }
    let logs: any[] = getDecodedLogs(receipts, abi)

    // let createEvents: SpotMarketCreateEvent[] = [];
    for (let log of logs) {
        if (log.tx_id === '0x9af2dde7333a23aae57d0d99cd4a2f84c78fbc8ac092aacd786ce11f8ab2719b') {
            console.log('LOG', log)
        }

        if (isEvent('TradeOrderEvent', log, abi)) {
            const idSource = `${log.base_token.bits}-${log.order_matcher.bits}-${log.seller.bits}-${log.buyer.bits}-${log.trade_size
                }-${log.trade_price}-${log.sell_order_id}-${log.buy_order_id}-${tai64ToDate(log.timestamp)}-${log.tx_id}`
            const id = crypto.createHash('sha256').update(idSource).digest('hex')

            let sellOrder = orders.get(log.sell_order_id)
            if (!sellOrder) {
                sellOrder = await ctx.store.get(Order, { where: { id: log.sell_order_id } })
            }

            let buyOrder = orders.get(log.buy_order_id)
            if (!buyOrder) {
                buyOrder = await ctx.store.get(Order, { where: { id: log.buy_order_id } })
            }

            let event = new TradeOrderEvent({
                id: id,
                baseSellOrderId: log.base_sell_order_id,
                baseBuyOrderId: log.base_buy_order_id,
                txId: log.tx_id,
                orderMatcher: log.order_matcher.bits,
                tradeSize: BigInt(log.trade_size),
                tradePrice: BigInt(log.trade_price),
                timestamp: tai64ToDate(log.timestamp).toString(),
            })
            tradeOrderEvents.set(event.id, event)
        }
    }

    await ctx.store.upsert([...orders.values()])
    // await ctx.store.save([...orderMatchEvents.values()])
    // await ctx.store.save([...marketCreateEvents.values()])
    await ctx.store.save([...tradeOrderEvents.values()])
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
        orderType:
            order.base_size.value === 0n ? undefined : order.base_size.negative ? OrderType.Sell : OrderType.Buy,
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

function decodeI64(i64: { readonly value: bigint; readonly negative: boolean }) {
    return (i64.negative ? '-' : '') + i64.value.toString()
}

async function lookUpOrder(store: Store, orders: Map<string, Order>, id: string) {
    let order = orders.get(id)
    if (!order) {
        order = await store.get(Order, id)
    }
    return order
}
