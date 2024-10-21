import { run } from '@subsquid/batch-processor'
import { TypeormDatabase } from '@subsquid/typeorm-store'
import { dataSource, processBlocks } from './dataSource'
import { handleOpenOrderEvent } from './openOrderEventHandler'
import { handleTradeOrderEvent } from './tradeOrderEventHandler'
import { handleCancelOrderEvent } from './cancelOrderEventHandler'
import { handleDepositEvent } from './depositEventHandler'
import { handleWithdrawEvent } from './withdrawEventHandler'
import { handleWithdrawToMarketEvent } from './withdrawToMarketEventHandler'
import { getEventType } from './types'
import type { ActiveBuyOrder, ActiveSellOrder, Balance, CancelOrderEvent, OpenOrderEvent, Order, TradeOrderEvent, WithdrawToMarketEvent, DepositEvent, WithdrawEvent } from './model'

const database = new TypeormDatabase();

run(dataSource, database, async (ctx) => {

    const balances: Map<string, Balance> = new Map();
    const orders: Map<string, Order> = new Map();
    const activeBuyOrders: Map<string, ActiveBuyOrder> = new Map();
    const activeSellOrders: Map<string, ActiveSellOrder> = new Map();
    const tradeOrderEvents: Map<string, TradeOrderEvent> = new Map();
    const openOrderEvents: Map<string, OpenOrderEvent> = new Map();
    const cancelOrderEvents: Map<string, CancelOrderEvent> = new Map();
    const depositEvents: Map<string, DepositEvent> = new Map();
    const withdrawEvents: Map<string, WithdrawEvent> = new Map();
    const withdrawToMarketEvents: Map<string, WithdrawToMarketEvent> = new Map();

	const { receipts, logs } = await processBlocks(ctx);

    for (let idx = 0; idx < logs.length; idx++) {
        const log = logs[idx];
        const receipt = receipts[idx];
        const event = getEventType(receipt.val1)

        if (event === 'OpenOrderEvent') {
            await handleOpenOrderEvent(log, receipt, openOrderEvents, orders, activeBuyOrders, activeSellOrders, balances, ctx);
        } else if (event === 'TradeOrderEvent') {
            await handleTradeOrderEvent(log, receipt, tradeOrderEvents, orders, activeBuyOrders, activeSellOrders, balances, ctx);
        } else if (event === 'CancelOrderEvent') {
            await handleCancelOrderEvent(log, receipt, cancelOrderEvents, orders, activeBuyOrders, activeSellOrders, balances, ctx);
        } else if (event === 'DepositEvent') {
            await handleDepositEvent(log, receipt, depositEvents, balances, ctx);
        } else if (event === 'WithdrawEvent') {
            await handleWithdrawEvent(log, receipt, withdrawEvents, balances, ctx);
        } else if (event === 'WithdrawToMarketEvent') {
            await handleWithdrawToMarketEvent(log, receipt, withdrawToMarketEvents, balances, ctx);
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
    await ctx.store.save([...withdrawToMarketEvents.values()])
})
