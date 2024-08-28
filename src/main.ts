import { run } from '@subsquid/batch-processor'
import { augmentBlock } from '@subsquid/fuel-objects'
import { DataSourceBuilder } from '@subsquid/fuel-stream'
import { Store, TypeormDatabase } from '@subsquid/typeorm-store'
import { assertNotNull } from '@subsquid/util-internal'
import { BN, getDecodedLogs, ReceiptLogData, ReceiptType } from 'fuels'
import { OrderbookAbi__factory } from './abi'
import {
    TradeOrderEventOutput,
    OpenOrderEventOutput,
    MatchOrderEventOutput,
    CancelOrderEventOutput,
    IdentityOutput,
} from './abi/OrderbookAbi'
import {
    Order,
    OrderType,
    OpenOrderEvent,
    CancelOrderEvent,
    MatchOrderEvent,
    TradeOrderEvent,
    OrderStatus,
    ActiveBuyOrder,
    ActiveSellOrder,
} from './model'
import isEvent from './utils/isEvent'
import tai64ToDate from './utils/tai64ToDate'
import assert from 'assert'
const ORDERBOOK_ID = '0x58959d086d8a6ee8cf8eeb572b111edb21661266be4b4885383748d11b72d0aa'

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
            hash: true,
            status: true
        }
    })
    .setBlockRange({
        from: 6142500,
    })
    .addReceipt({
        type: ['LOG_DATA'],
        transaction: true,
        contract: [ORDERBOOK_ID],
    })
    .build()

const database = new TypeormDatabase()

// Now we are ready to start data processing
run(dataSource, database, async (ctx) => {
    // Block items that we get from `ctx.blocks` are flat JS objects.
    //
    // We can use `augmentBlock()` function from `@subsquid/fuel-objects`
    // to enrich block items with references to related objects.
    let blocks = ctx.blocks.map(augmentBlock)

    let orders: Map<string, Order> = new Map()
    let activeBuyOrders: Map<string, ActiveBuyOrder> = new Map()
    let activeSellOrders: Map<string, ActiveSellOrder> = new Map()
    let tradeOrderEvents: Map<string, TradeOrderEvent> = new Map()
    let matchOrderEvents: Map<string, MatchOrderEvent> = new Map()
    let openOrderEvents: Map<string, OpenOrderEvent> = new Map()
    let cancelOrderEvents: Map<string, CancelOrderEvent> = new Map()

    const receipts: (ReceiptLogData & { data: string, time: bigint, txId: string, receiptId: string })[] = []
    for (let block of blocks) {
        for (let receipt of block.receipts) {
            let tx = assertNotNull(receipt.transaction)
            if (receipt.contract == ORDERBOOK_ID && tx.status.type == 'SuccessStatus') {
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
                    time: tx.status.time,
                    txId: tx.hash,
                    receiptId: receipt.id,
                })
            }
        }
    }

    let logs: any[] = getDecodedLogs(receipts, OrderbookAbi__factory.abi)
    assert(logs.length == receipts.length)

    for (let idx = 0; idx < logs.length; idx++) {
        let log = logs[idx]
        let receipt = receipts[idx]

        if (isEvent<OpenOrderEventOutput>('OpenOrderEvent', log, OrderbookAbi__factory.abi)) {
            let event = new OpenOrderEvent({
                id: receipt.receiptId,
                orderId: log.order_id,
                txId: receipt.txId,
                asset: log.asset.bits,
                amount: BigInt(log.amount.toString()),
                orderType: log.order_type as unknown as OrderType,
                price: BigInt(log.price.toString()),
                user: getIdentity(log.user),
                timestamp: tai64ToDate(receipt.time).toISOString(),
            })
            openOrderEvents.set(event.id, event)

            let props = {
                ...event,
                id: log.order_id,
                initialAmount: BigInt(log.amount.toString()),
                status: OrderStatus.Active,
                amount: BigInt(log.amount.toString()),
                asset: log.asset.bits,
                orderType: log.order_type as unknown as OrderType,
                price: BigInt(log.price.toString()),
                user: getIdentity(log.user),
                timestamp: tai64ToDate(receipt.time).toISOString(),
            }
            let order = new Order(props)
            orders.set(order.id, order)

            if (order.orderType == OrderType.Buy) {
                let buyOrder = new ActiveBuyOrder(props)
                activeBuyOrders.set(order.id, buyOrder)
            } else if (order.orderType === OrderType.Sell) {
                let sellOrder = new ActiveSellOrder(props)
                activeSellOrders.set(order.id, sellOrder)
            }

        } else if (isEvent<TradeOrderEventOutput>('TradeOrderEvent', log, OrderbookAbi__factory.abi)) {
            let event = new TradeOrderEvent({
                id: receipt.receiptId,
                baseSellOrderId: log.base_sell_order_id,
                baseBuyOrderId: log.base_buy_order_id,
                txId: log.tx_id,
                orderMatcher: getIdentity(log.order_matcher),
                tradeSize: BigInt(log.trade_size.toString()),
                tradePrice: BigInt(log.trade_price.toString()),
                timestamp: tai64ToDate(receipt.time).toISOString(),
            })
            tradeOrderEvents.set(event.id, event)
        } else if (isEvent<MatchOrderEventOutput>('MatchOrderEvent', log, OrderbookAbi__factory.abi)) {
            let event = new MatchOrderEvent({
                id: receipt.receiptId,
                orderId: log.order_id,
                txId: receipt.txId,
                asset: log.asset.bits,
                orderMatcher: getIdentity(log.order_matcher),
                owner: getIdentity(log.owner),
                counterparty: getIdentity(log.counterparty),
                matchSize: BigInt(log.match_size.toString()),
                matchPrice: BigInt(log.match_price.toString()),
                timestamp: tai64ToDate(receipt.time).toISOString(),
            })
            matchOrderEvents.set(event.id, event)

            let order = assertNotNull(await lookupOrder(ctx.store, orders, log.order_id))
            let amount = order.amount - event.matchSize
            let update = {
                amount,
                status: amount === 0n ? OrderStatus.Closed : OrderStatus.Active,
                timestamp: tai64ToDate(receipt.time).toISOString(),
            }
            Object.assign(order, update)

            if (order.status == OrderStatus.Closed) {
                if (order.orderType == OrderType.Buy) {
                    await ctx.store.remove(ActiveBuyOrder, order.id)
                    activeBuyOrders.delete(order.id)
                } else if (order.orderType == OrderType.Sell) {
                    await ctx.store.remove(ActiveSellOrder, order.id)
                    activeSellOrders.delete(order.id)
                }
            } else {
                if (order.orderType == OrderType.Buy) {
                    let buyOrder = assertNotNull(await lookupBuyOrder(ctx.store, activeBuyOrders, order.id))
                    Object.assign(buyOrder, update)
                } else if (order.orderType == OrderType.Sell) {
                    let sellOrder = assertNotNull(await lookupSellOrder(ctx.store, activeSellOrders, order.id))
                    Object.assign(sellOrder, update)
                }
            }

        } else if (isEvent<CancelOrderEventOutput>('CancelOrderEvent', log, OrderbookAbi__factory.abi)) {
            let event = new CancelOrderEvent({
                id: receipt.receiptId,
                orderId: log.order_id,
                txId: receipt.txId,
                timestamp: tai64ToDate(receipt.time).toISOString(),
            })
            cancelOrderEvents.set(event.id, event)

            let order = assertNotNull(await lookupOrder(ctx.store, orders, log.order_id))
            order.amount = 0n
            order.status = OrderStatus.Canceled
            order.timestamp = tai64ToDate(receipt.time).toISOString()

            if (order.orderType == OrderType.Buy) {
                await ctx.store.remove(ActiveBuyOrder, order.id)
                activeBuyOrders.delete(order.id)
            } else if (order.orderType == OrderType.Sell) {
                await ctx.store.remove(ActiveSellOrder, order.id)
                activeSellOrders.delete(order.id)
            }

        }
    }

    await ctx.store.upsert([...orders.values()])
    await ctx.store.upsert([...activeBuyOrders.values()])
    await ctx.store.upsert([...activeSellOrders.values()])
    await ctx.store.save([...tradeOrderEvents.values()])
    await ctx.store.save([...openOrderEvents.values()])
    await ctx.store.save([...matchOrderEvents.values()])
    await ctx.store.save([...cancelOrderEvents.values()])
})


async function lookupOrder(store: Store, orders: Map<string, Order>, id: string) {
    let order = orders.get(id)
    if (!order) {
        order = await store.get(Order, id)
        if (order) {
            orders.set(id, order)
        }
    }
    return order
}


async function lookupBuyOrder(store: Store, orders: Map<string, ActiveBuyOrder>, id: string) {
    let order = orders.get(id)
    if (!order) {
        order = await store.get(ActiveBuyOrder, id)
        if (order) {
            orders.set(id, order)
        }
    }
    return order
}


async function lookupSellOrder(store: Store, orders: Map<string, ActiveBuyOrder>, id: string) {
    let order = orders.get(id)
    if (!order) {
        order = await store.get(ActiveSellOrder, id)
        if (order) {
            orders.set(id, order)
        }
    }
    return order
}


function getIdentity(output: IdentityOutput): string {
    return assertNotNull(output.Address?.bits || output.ContractId?.bits)
}
