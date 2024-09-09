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
    CancelOrderEventOutput,
    IdentityOutput,
    DepositEventOutput,
    WithdrawEventOutput,
} from './abi/OrderbookAbi'
import {
    Order,
    Balance,
    OrderType,
    OpenOrderEvent,
    CancelOrderEvent,
    TradeOrderEvent,
    OrderStatus,
    ActiveBuyOrder,
    ActiveSellOrder,
    DepositEvent,
    WithdrawEvent,
} from './model'
import isEvent from './utils/isEvent'
import tai64ToDate from './utils/tai64ToDate'
import assert from 'assert'
import { getHash } from './utils/getHash'
import { BASE_ASSET, BASE_DECIMAL, PRICE_DECIMAL, QUOTE_ASSET, QUOTE_DECIMAL } from './utils/marketConfig'
const ORDERBOOK_ID = '0x1e4a18c96d53b5bdeda03652ed58288cfdd03a9560088da3321d1052a9859d7a'

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

    let balances: Map<string, Balance> = new Map()
    let orders: Map<string, Order> = new Map()
    let activeBuyOrders: Map<string, ActiveBuyOrder> = new Map()
    let activeSellOrders: Map<string, ActiveSellOrder> = new Map()
    let tradeOrderEvents: Map<string, TradeOrderEvent> = new Map()
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

            let order = {
                ...event,
                id: log.order_id,
                initialAmount: BigInt(log.amount.toString()),
                status: OrderStatus.Active,
            }
            orders.set(order.id, new Order(order))

            if (order.orderType == OrderType.Buy) {
                let buyOrder = new ActiveBuyOrder(order)
                activeBuyOrders.set(order.id, buyOrder)
            } else if (order.orderType === OrderType.Sell) {
                let sellOrder = new ActiveSellOrder(order)
                activeSellOrders.set(order.id, sellOrder)
            }

            if (order.orderType == OrderType.Buy) {
                const balanceId = getHash(`${QUOTE_ASSET}-${getIdentity(log.user)}`);
                let balance = await lookupBalance(ctx.store, balances, balanceId)

                if (!balance) {
                    console.log(
                        `Cannot find a balance; user:${getIdentity(log.user)}; asset: ${QUOTE_ASSET}; id: ${balanceId}`
                    );
                    return;
                }
                const updatedAmount = balance.amount - BigInt(log.amount.toString()) * BigInt(log.price.toString()) * BigInt(QUOTE_DECIMAL) / BigInt(BASE_DECIMAL) / BigInt(PRICE_DECIMAL);
                balance.amount = updatedAmount;
                balances.set(balance.id, balance);


            } else if (order.orderType === OrderType.Sell) {
                const balanceId = getHash(`${BASE_ASSET}-${getIdentity(log.user)}`);
                let balance = await lookupBalance(ctx.store, balances, balanceId)

                if (!balance) {
                    console.log(
                        `Cannot find a balance; user:${getIdentity(log.user)}; asset: ${BASE_ASSET}; id: ${balanceId}`
                    );
                    return;
                }

                const updatedAmount = balance.amount - BigInt(log.amount.toString());
                balance.amount = updatedAmount;
                balances.set(balance.id, balance);
            }


        } else if (isEvent<TradeOrderEventOutput>('TradeOrderEvent', log, OrderbookAbi__factory.abi)) {
            let event = new TradeOrderEvent({
                id: receipt.receiptId,
                sellOrderId: log.base_sell_order_id,
                buyOrderId: log.base_buy_order_id,
                tradeSize: BigInt(log.trade_size.toString()),
                tradePrice: BigInt(log.trade_price.toString()),
                orderMatcher: getIdentity(log.order_matcher),
                seller: getIdentity(log.order_seller),
                buyer: getIdentity(log.order_buyer),
                txId: receipt.txId,
                timestamp: tai64ToDate(receipt.time).toISOString(),
            })
            tradeOrderEvents.set(event.id, event)

            let sellOrder = assertNotNull(await lookupOrder(ctx.store, orders, log.base_sell_order_id))
            let buyOrder = assertNotNull(await lookupOrder(ctx.store, orders, log.base_buy_order_id))


            let updatedSellAmount = sellOrder.amount - event.tradeSize
            const isSellOrderClosed = updatedSellAmount === 0n
            let updatedSellOrder = {
                updatedSellAmount,
                status: updatedSellAmount === 0n ? OrderStatus.Closed : OrderStatus.Active,
                timestamp: tai64ToDate(receipt.time).toISOString(),
            }
            Object.assign(sellOrder, updatedSellOrder)



            let updatedBuyAmount = buyOrder.amount - event.tradeSize
            const isBuyOrderClosed = updatedBuyAmount === 0n
            let updatedBuyOrder = {
                updatedBuyAmount,
                status: updatedBuyAmount === 0n ? OrderStatus.Closed : OrderStatus.Active,
                timestamp: tai64ToDate(receipt.time).toISOString(),
            }
            Object.assign(buyOrder, updatedBuyOrder)


            if (isBuyOrderClosed) {
                await ctx.store.remove(ActiveBuyOrder, log.base_buy_order_id)
                activeBuyOrders.delete(log.base_buy_order_id)
            } else {
                let buyOrder = assertNotNull(await lookupBuyOrder(ctx.store, activeBuyOrders, log.base_buy_order_id))
                Object.assign(buyOrder, updatedBuyOrder)
            }

            if (isSellOrderClosed) {
                await ctx.store.remove(ActiveSellOrder, log.base_sell_order_id)
                activeSellOrders.delete(log.base_sell_order_id)
            } else {
                let sellOrder = assertNotNull(await lookupSellOrder(ctx.store, activeSellOrders, log.base_sell_order_id))
                Object.assign(sellOrder, updatedSellOrder)
            }

            const buyerBalanceId = getHash(`${BASE_ASSET}-${getIdentity(log.order_buyer)}`)
            let buyerBalance = await lookupBalance(ctx.store, balances, buyerBalanceId)
            if (!buyerBalance) {
                buyerBalance = new Balance({
                    id: buyerBalanceId,
                    user: getIdentity(log.order_buyer),
                    asset: BASE_ASSET,
                    amount: 0n,
                    timestamp: tai64ToDate(receipt.time).toISOString(),
                });
            }

            buyerBalance.amount += BigInt(log.trade_size.toString());
            balances.set(buyerBalance.id, buyerBalance);


            const sellerBalanceId = getHash(`${QUOTE_ASSET}-${getIdentity(log.order_seller)}`)
            let sellerBalance = await lookupBalance(ctx.store, balances, sellerBalanceId)

            if (!sellerBalance) {
                sellerBalance = new Balance({
                    id: sellerBalanceId,
                    user: getIdentity(log.order_seller),
                    asset: QUOTE_ASSET,
                    amount: 0n,
                    timestamp: tai64ToDate(receipt.time).toISOString(),
                });
            }

            sellerBalance.amount += (BigInt(log.trade_size.toString()) * BigInt(log.trade_price.toString()) * BigInt(QUOTE_DECIMAL)) / (BigInt(PRICE_DECIMAL) * BigInt(BASE_DECIMAL));
            balances.set(sellerBalance.id, sellerBalance);


        } else if (isEvent<CancelOrderEventOutput>('CancelOrderEvent', log, OrderbookAbi__factory.abi)) {
            let event = new CancelOrderEvent({
                id: receipt.receiptId,
                orderId: log.order_id,
                user: getIdentity(log.user),
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



            

        } else if (isEvent<DepositEventOutput>('DepositEvent', log, OrderbookAbi__factory.abi)) {
            let event = new DepositEvent({
                id: receipt.receiptId,
                txId: receipt.txId,
                amount: BigInt(log.amount.toString()),
                asset: log.asset.bits,
                user: getIdentity(log.user),
                timestamp: tai64ToDate(receipt.time).toISOString(),
            })
            depositEvents.set(event.id, event)

            const asset = log.asset.bits;
            const isBaseAsset = asset === BASE_ASSET;

            const balanceId = isBaseAsset
                ? getHash(`${BASE_ASSET}-${getIdentity(log.user)}`)
                : getHash(`${QUOTE_ASSET}-${getIdentity(log.user)}`);

            let balance = await lookupBalance(ctx.store, balances, balanceId)
            if (balance) {
                balance.amount += BigInt(log.amount.toString())
            } else {
                balance = new Balance({
                    id: balanceId,
                    amount: BigInt(log.amount.toString()),
                    asset: log.asset.bits,
                    user: getIdentity(log.user),
                    timestamp: tai64ToDate(receipt.time).toISOString(),
                })
                balances.set(balance.id, balance)
            }
        } else if (isEvent<WithdrawEventOutput>('WithdrawEvent', log, OrderbookAbi__factory.abi)) {
            let event = new WithdrawEvent({
                id: receipt.receiptId,
                txId: receipt.txId,
                amount: BigInt(log.amount.toString()),
                asset: log.asset.bits,
                user: getIdentity(log.user),
                timestamp: tai64ToDate(receipt.time).toISOString()
            })
            withdrawEvents.set(event.id, event)

            const asset = log.asset.bits;
            const isBaseAsset = asset === BASE_ASSET;

            const balanceId = isBaseAsset
                ? getHash(`${BASE_ASSET}-${getIdentity(log.user)}`)
                : getHash(`${QUOTE_ASSET}-${getIdentity(log.user)}`);

            let balance = assertNotNull(await lookupBalance(ctx.store, balances, balanceId))
            balance.amount -= BigInt(log.amount.toString())
        }
    }


    await ctx.store.upsert([...balances.values()])
    await ctx.store.upsert([...orders.values()])
    await ctx.store.upsert([...activeBuyOrders.values()])
    await ctx.store.upsert([...activeSellOrders.values()])
    await ctx.store.save([...tradeOrderEvents.values()])
    await ctx.store.save([...openOrderEvents.values()])
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
