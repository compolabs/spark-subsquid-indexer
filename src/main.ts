import { run } from '@subsquid/batch-processor'
import { TypeormDatabase } from '@subsquid/typeorm-store'
import { dataSource, processBlocks } from './dataSource'
import { handleOpenOrderEvent } from './openOrderEventHandler'
import { handleTradeOrderEvent } from './tradeOrderEventHandler'
import { handleCancelOrderEvent } from './cancelOrderEventHandler'
import { handleDepositEvent } from './depositEventHandler'
import { handleDepositForEvent } from './depositForEventHandler'
import { handleWithdrawEvent } from './withdrawEventHandler'
import { handleWithdrawToMarketEvent } from './withdrawToMarketEventHandler'
import { getEventType } from './types'

const database = new TypeormDatabase()

run(dataSource, database, async (ctx) => {

    let balances: Map<string, any> = new Map();
    let orders: Map<string, any> = new Map();
    let activeBuyOrders: Map<string, any> = new Map();
    let activeSellOrders: Map<string, any> = new Map();
    let tradeOrderEvents: Map<string, any> = new Map();
    let openOrderEvents: Map<string, any> = new Map();
    let cancelOrderEvents: Map<string, any> = new Map();
    let depositEvents: Map<string, any> = new Map();
    let depositForEvents: Map<string, any> = new Map();
    let withdrawEvents: Map<string, any> = new Map();
    let withdrawToMarketEvents: Map<string, any> = new Map();

    const { receipts, logs } = await processBlocks(ctx);

    for (let idx = 0; idx < logs.length; idx++) {
        let log = logs[idx];
        let receipt = receipts[idx];
        let event = getEventType(receipt.val1)

        if (event == 'OpenOrderEvent') {
            await handleOpenOrderEvent(log, receipt, openOrderEvents, orders, activeBuyOrders, activeSellOrders, balances, ctx);
        } else if (event == 'TradeOrderEvent') {
            await handleTradeOrderEvent(log, receipt, tradeOrderEvents, orders, activeBuyOrders, activeSellOrders, balances, ctx);
        } else if (event == 'CancelOrderEvent') {
            await handleCancelOrderEvent(log, receipt, cancelOrderEvents, orders, activeBuyOrders, activeSellOrders, balances, ctx);
        } else if (event == 'DepositEvent') {
            await handleDepositEvent(log, receipt, depositEvents, balances, ctx);
        } else if (event == 'DepositForEvent') {
            await handleDepositForEvent(log, receipt, depositForEvents, balances, ctx);
        } else if (event == 'WithdrawEvent') {
            await handleWithdrawEvent(log, receipt, withdrawEvents, balances, ctx);
        } else if (event == 'WithdrawToMarketEvent') {
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
    await ctx.store.save([...depositForEvents.values()])
    await ctx.store.save([...withdrawEvents.values()])
    await ctx.store.save([...withdrawToMarketEvents.values()])
})