import { run } from '@subsquid/batch-processor'
import { augmentBlock } from '@subsquid/fuel-objects'
import { DataSourceBuilder } from '@subsquid/fuel-stream'
import { Store, TypeormDatabase } from '@subsquid/typeorm-store'
import { assertNotNull } from '@subsquid/util-internal'
import crypto from 'crypto'
import { BN, getDecodedLogs, ReceiptLogData, ReceiptType } from 'fuels'
import { OrderbookAbi__factory } from './abi'
import {
    TradeOrderEventOutput,
    OpenOrderEventOutput,
    MatchOrderEventOutput,
    CancelOrderEventOutput,
    DepositEventOutput,
    WithdrawEventOutput,
    IdentityOutput,
    AssetIdOutput
} from './abi/OrderbookAbi'
import {
    Order,
    OrderType,
    OpenOrderEvent,
    CancelOrderEvent,
    MatchOrderEvent,
    TradeOrderEvent,
    DepositEvent,
    WithdrawEvent,
    OrderStatus,
    Balance,
    AssetType,
} from './model'
import isEvent from './utils/isEvent'
import tai64ToDate from './utils/tai64ToDate'
import assert from 'assert'
import resolversModule from './resolvers';
const pubsub = resolversModule.pubsub;
const ORDERBOOK_ID = '0x7278edd30be6b982d3196ffb2790321d8546814226e51e82c8136c8f6d3c0c97'

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
        from: 3328453,
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
    let activeBuyOrders: Map<string, Order> = new Map()
    let activeSellOrders: Map<string, Order> = new Map()
    let balances: Map<string, Balance> = new Map()
    let tradeOrderEvents: Map<string, TradeOrderEvent> = new Map()
    let matchOrderEvents: Map<string, MatchOrderEvent> = new Map()
    let openOrderEvents: Map<string, OpenOrderEvent> = new Map()
    let cancelOrderEvents: Map<string, CancelOrderEvent> = new Map()
    let depositEvents: Map<string, DepositEvent> = new Map()
    let withdrawEvents: Map<string, WithdrawEvent> = new Map()

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
            const orderType = log.order_type;
            let event = new OpenOrderEvent({
                id: receipt.receiptId,
                orderId: log.order_id,
                txId: receipt.txId,
                asset: log.asset.bits,
                amount: BigInt(log.amount.toString()),
                assetType: log.asset_type as unknown as AssetType,
                orderType: log.order_type as unknown as OrderType,
                price: BigInt(log.price.toString()),
                user: getIdentity(log.user),
                timestamp: tai64ToDate(receipt.time).toISOString(),
            })
            openOrderEvents.set(event.id, event)

            let order = new Order({
                ...event,
                id: log.order_id,
                initialAmount: BigInt(log.amount.toString()),
                status: OrderStatus.Active,
                // amount: BigInt(log.amount.toString()),
                // asset: log.asset.bits,
                // assetType: log.asset_type as unknown as AssetType,
                // orderType: log.order_type as unknown as OrderType,
                // price: BigInt(log.price.toString()),
                // user: getIdentity(log.user),
                // timestamp: tai64ToDate(receipt.time).toISOString(),
            })
            orders.set(order.id, order)

            if (orderType === "Buy") {
                activeBuyOrders.set(order.id, order);
            } else if (orderType === "Sell") {
                activeSellOrders.set(order.id, order);
            }
            pubsub.publish('ORDER_UPDATED', { orderUpdated: order })
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
                asset: log.asset as unknown as AssetType,
                orderMatcher: getIdentity(log.order_matcher),
                owner: getIdentity(log.owner),
                counterparty: getIdentity(log.counterparty),
                matchSize: BigInt(log.match_size.toString()),
                matchPrice: BigInt(log.match_price.toString()),
                timestamp: tai64ToDate(receipt.time).toISOString(),
            })
            matchOrderEvents.set(event.id, event)

            let order = assertNotNull(await lookupOrder(ctx.store, orders, log.order_id))
            let activeBuyOrder = assertNotNull(await lookupOrder(ctx.store, activeBuyOrders, log.order_id))
            let activeSellOrder = assertNotNull(await lookupOrder(ctx.store, activeSellOrders, log.order_id))
            let amount = order.amount - event.matchSize

            order.amount = amount
            order.status = amount == 0n ? OrderStatus.Closed : OrderStatus.Active
            order.timestamp = tai64ToDate(receipt.time).toISOString()

            activeBuyOrder.amount = amount
            activeBuyOrder.status = amount == 0n ? OrderStatus.Closed : OrderStatus.Active
            activeBuyOrder.timestamp = tai64ToDate(receipt.time).toISOString()

            activeSellOrder.amount = amount
            activeSellOrder.status = amount == 0n ? OrderStatus.Closed : OrderStatus.Active
            activeSellOrder.timestamp = tai64ToDate(receipt.time).toISOString()

            pubsub.publish('ORDER_UPDATED', { orderUpdated: order })
        } else if (isEvent<CancelOrderEventOutput>('CancelOrderEvent', log, OrderbookAbi__factory.abi)) {
            let event = new CancelOrderEvent({
                id: receipt.receiptId,
                orderId: log.order_id,
                txId: receipt.txId,
                timestamp: tai64ToDate(receipt.time).toISOString(),
            })
            cancelOrderEvents.set(event.id, event)

            let order = assertNotNull(await lookupOrder(ctx.store, orders, log.order_id))
            let activeBuyOrder = assertNotNull(await lookupOrder(ctx.store, activeBuyOrders, log.order_id))
            let activeSellOrder = assertNotNull(await lookupOrder(ctx.store, activeSellOrders, log.order_id))

            order.amount = 0n
            order.status = OrderStatus.Canceled
            order.timestamp = tai64ToDate(receipt.time).toISOString()

            activeBuyOrder.amount = 0n
            activeBuyOrder.status = OrderStatus.Canceled
            activeBuyOrder.timestamp = tai64ToDate(receipt.time).toISOString()

            activeSellOrder.amount = 0n
            activeSellOrder.status = OrderStatus.Canceled
            activeSellOrder.timestamp = tai64ToDate(receipt.time).toISOString()

            pubsub.publish('ORDER_UPDATED', { orderUpdated: order })
        } else if (isEvent<DepositEventOutput>('DepositEvent', log, OrderbookAbi__factory.abi)) {
            let event = new DepositEvent({
                id: receipt.receiptId,
                txId: receipt.txId,
                amount: BigInt(log.amount.toString()),
                asset: log.asset as unknown as AssetType,
                user: getIdentity(log.user),
                timestamp: tai64ToDate(receipt.time).toISOString(),
            })
            depositEvents.set(event.id, event)

            let id = generateBalanceId(log.asset, log.user)
            let balance = await lookupBalance(ctx.store, balances, id)
            if (balance) {
                balance.amount += BigInt(log.amount.toString())
            } else {
                balance = new Balance({
                    id,
                    amount: BigInt(log.amount.toString()),
                    asset: log.asset as unknown as AssetType,
                    user: getIdentity(log.user),
                })
                balances.set(balance.id, balance)
            }
        } else if (isEvent<WithdrawEventOutput>('WithdrawEvent', log, OrderbookAbi__factory.abi)) {
            let event = new WithdrawEvent({
                id: receipt.receiptId,
                txId: receipt.txId,
                amount: BigInt(log.amount.toString()),
                asset: log.asset as unknown as AssetType,
                user: getIdentity(log.user),
                timestamp: tai64ToDate(receipt.time).toISOString()
            })
            withdrawEvents.set(event.id, event)

            let id = generateBalanceId(log.asset, log.user)
            let balance = assertNotNull(await lookupBalance(ctx.store, balances, id))
            balance.amount -= BigInt(log.amount.toString())
        }
    }

    await ctx.store.upsert([...orders.values()])
    await ctx.store.upsert([...balances.values()])
    await ctx.store.save([...tradeOrderEvents.values()])
    await ctx.store.save([...openOrderEvents.values()])
    await ctx.store.save([...matchOrderEvents.values()])
    await ctx.store.save([...cancelOrderEvents.values()])
    await ctx.store.save([...depositEvents.values()])
    await ctx.store.save([...withdrawEvents.values()])
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

async function lookupBalance(store: Store, balances: Map<string, Balance>, id: string) {
    let balance = balances.get(id)
    if (!balance) {
        balance = await store.get(Balance, id)
        if (balance) {
            balances.set(id, balance)
        }
    }
    return balance
}


function getIdentity(output: IdentityOutput): string {
    return assertNotNull(output.Address?.bits || output.ContractId?.bits)
}


function generateBalanceId(asset: AssetIdOutput, identity: IdentityOutput): string {
    let idSource = `${asset.bits}-${getIdentity(identity)}`
    return crypto.createHash('sha256').update(idSource).digest('hex')
}
