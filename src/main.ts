import { run } from '@subsquid/batch-processor'
import { TypeormDatabase } from '@subsquid/typeorm-store'
import {
    TradeOrderEventOutput,
    OpenOrderEventOutput,
    CancelOrderEventOutput,
    DepositEventOutput,
    DepositForEventOutput,
    WithdrawEventOutput,
    WithdrawToMarketEventOutput,
    Market,
} from './abi/Market'
import isEvent from './isEvent'
import { dataSource, processBlocks } from './dataSource'
import { handleOpenOrderEvent } from './openOrderEventHandler'
import { handleTradeOrderEvent } from './tradeOrderEventHandler'
import { handleCancelOrderEvent } from './cancelOrderEventHandler'
import { handleDepositEvent } from './depositEventHandler'
import { handleDepositForEvent } from './depositForEventHandler'
import { handleWithdrawEvent } from './withdrawEventHandler'
import { handleWithdrawToMarketEvent } from './withdrawToMarketEventHandler'

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

        if (isEvent<OpenOrderEventOutput>('OpenOrderEvent', log, Market.abi)) {
            await handleOpenOrderEvent(log, receipt, openOrderEvents, orders, activeBuyOrders, activeSellOrders, balances, ctx);
        } else if (isEvent<TradeOrderEventOutput>('TradeOrderEvent', log, Market.abi)) {
            await handleTradeOrderEvent(log, receipt, tradeOrderEvents, orders, activeBuyOrders, activeSellOrders, balances, ctx);
        } else if (isEvent<CancelOrderEventOutput>('CancelOrderEvent', log, Market.abi)) {
            await handleCancelOrderEvent(log, receipt, cancelOrderEvents, orders, activeBuyOrders, activeSellOrders, balances, ctx);
        } else if (isEvent<DepositEventOutput>('DepositEvent', log, Market.abi)) {
            await handleDepositEvent(log, receipt, depositEvents, balances, ctx);
        } else if (isEvent<DepositForEventOutput>('DepositForEvent', log, Market.abi)) {
            await handleDepositForEvent(log, receipt, depositForEvents, balances, ctx);
        } else if (isEvent<WithdrawEventOutput>('WithdrawEvent', log, Market.abi)) {
            await handleWithdrawEvent(log, receipt, withdrawEvents, balances, ctx);
        } else if (isEvent<WithdrawToMarketEventOutput>('WithdrawToMarketEvent', log, Market.abi)) {
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