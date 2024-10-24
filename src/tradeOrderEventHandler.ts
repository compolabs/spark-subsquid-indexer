import { nanoid } from 'nanoid';
import type { TradeOrderEventOutput } from './abi/Market';
import { TradeOrderEvent, OrderStatus, ActiveBuyOrder, ActiveSellOrder, type Order, type Balance } from './model';
import tai64ToDate, { getIdentity, lookupOrder, lookupBalance, lookupBuyOrder, lookupSellOrder, getHash, updateUserBalance } from './utils';
import { assertNotNull } from '@subsquid/util-internal'

export async function handleTradeOrderEvent(log: TradeOrderEventOutput, receipt: any, tradeOrderEvents: Map<string, TradeOrderEvent>, orders: Map<string, Order>, activeBuyOrders: Map<string, ActiveBuyOrder>, activeSellOrders: Map<string, ActiveSellOrder>, balances: Map<string, Balance>, ctx: any) {

  // Construct the TradeOrderEvent and save in context for tracking
  const event = new TradeOrderEvent({
    id: getHash(`${receipt.txId}-${nanoid()}`),
    market: receipt.id,
    sellOrderId: log.base_sell_order_id,
    buyOrderId: log.base_buy_order_id,
    tradeSize: BigInt(log.trade_size.toString()),
    tradePrice: BigInt(log.trade_price.toString()),
    seller: getIdentity(log.order_seller),
    buyer: getIdentity(log.order_buyer),
    sellerIsMaker: log.seller_is_maker,
    sellerBaseAmount: BigInt(log.s_balance.liquid.base.toString()),
    sellerQuoteAmount: BigInt(log.s_balance.liquid.quote.toString()),
    buyerBaseAmount: BigInt(log.b_balance.liquid.base.toString()),
    buyerQuoteAmount: BigInt(log.b_balance.liquid.quote.toString()),
    txId: receipt.txId,
    timestamp: tai64ToDate(receipt.time).toISOString(),
  })
  tradeOrderEvents.set(event.id, event)

  // Retrieve the active buy and active sell orders
  const sellActiveOrder = assertNotNull(await lookupSellOrder(ctx.store, activeSellOrders, log.base_sell_order_id))
  const buyActiveOrder = assertNotNull(await lookupBuyOrder(ctx.store, activeBuyOrders, log.base_buy_order_id))

  // Retrieve the buy and sell orders
  const sellOrder = assertNotNull(await lookupOrder(ctx.store, orders, log.base_sell_order_id))
  const buyOrder = assertNotNull(await lookupOrder(ctx.store, orders, log.base_buy_order_id))

  // Retrieve the balances for buyer and seller
  const sellerBalance = assertNotNull(await lookupBalance(ctx.store, balances, getHash(`${getIdentity(log.order_seller)}-${receipt.id}`)))
  const buyerBalance = assertNotNull(await lookupBalance(ctx.store, balances, getHash(`${getIdentity(log.order_buyer)}-${receipt.id}`)))

  // Update the active sell order status to "Closed" if fully executed, otherwise "Active"
  if (sellActiveOrder) {
    const updatedActiveSellAmount = sellActiveOrder.amount - event.tradeSize
    const isActiveSellOrderClosed = updatedActiveSellAmount === 0n
    sellActiveOrder.amount = sellActiveOrder.amount - event.tradeSize
    sellActiveOrder.status = updatedActiveSellAmount === 0n ? OrderStatus.Closed : OrderStatus.Active
    sellActiveOrder.timestamp = tai64ToDate(receipt.time).toISOString()
    activeSellOrders.set(sellActiveOrder.id, sellActiveOrder);

    // Remove the sell order from active orders if fully executed
    if (isActiveSellOrderClosed) {
      await ctx.store.remove(ActiveSellOrder, log.base_sell_order_id)
      activeSellOrders.delete(log.base_sell_order_id)
    } else {
      activeSellOrders.set(sellActiveOrder.id, sellActiveOrder);
    }
  } else {
    ctx.log.warn(`NO ACTIVE SELL ORDER TRADE FOR USER: ${getIdentity(log.order_seller)} ORDER ID: ${log.base_sell_order_id} MARKET: ${receipt.id}.`);
  }

  // Update the active buy order status to "Closed" if fully executed, otherwise "Active"
  if (buyActiveOrder) {
    const updatedActiveBuyAmount = buyActiveOrder.amount - event.tradeSize
    const isActiveBuyOrderClosed = updatedActiveBuyAmount === 0n
    buyActiveOrder.amount = buyActiveOrder.amount - event.tradeSize
    buyActiveOrder.status = updatedActiveBuyAmount === 0n ? OrderStatus.Closed : OrderStatus.Active
    buyActiveOrder.timestamp = tai64ToDate(receipt.time).toISOString()
    activeBuyOrders.set(buyActiveOrder.id, buyActiveOrder);

    // Remove the buy order from active orders if fully executed
    if (isActiveBuyOrderClosed) {
      await ctx.store.remove(ActiveBuyOrder, log.base_buy_order_id)
      activeBuyOrders.delete(log.base_buy_order_id)
    } else {
      activeBuyOrders.set(buyActiveOrder.id, buyActiveOrder);
    }
  } else {
    ctx.log.warn(`NO ACTIVE BUY ORDER TRADE FOR USER: ${getIdentity(log.order_buyer)} ORDER ID: ${log.base_buy_order_id} MARKET: ${receipt.id}.`);
  }

  // Update the sell order status to "Closed" if fully executed, otherwise "Active"
  if (sellOrder) {
    const updatedSellAmount = sellOrder.amount - event.tradeSize
    sellOrder.amount = sellOrder.amount - event.tradeSize
    sellOrder.status = updatedSellAmount === 0n ? OrderStatus.Closed : OrderStatus.Active
    sellOrder.timestamp = tai64ToDate(receipt.time).toISOString()
    orders.set(sellOrder.id, sellOrder);
  } else {
    ctx.log.warn(`NO SELL ORDER TRADE FOR USER: ${getIdentity(log.order_seller)} ORDER ID: ${log.base_sell_order_id} MARKET: ${receipt.id}.`);
  }

  // Update the buy order status to "Closed" if fully executed, otherwise "Active"
  if (buyOrder) {
    const updatedBuyAmount = buyOrder.amount - event.tradeSize
    buyOrder.amount = buyOrder.amount - event.tradeSize
    buyOrder.status = updatedBuyAmount === 0n ? OrderStatus.Closed : OrderStatus.Active
    buyOrder.timestamp = tai64ToDate(receipt.time).toISOString()
    orders.set(buyOrder.id, buyOrder);
  } else {
    ctx.log.warn(`NO BUY ORDER TRADE FOR USER: ${getIdentity(log.order_buyer)} ORDER ID: ${log.base_buy_order_id} MARKET: ${receipt.id}.`);
  }
  
  // Update the buyer and seller balances with the new base and quote amounts
  updateUserBalance("TRADE", BigInt(log.s_balance.liquid.base.toString()), BigInt(log.s_balance.liquid.quote.toString()), tai64ToDate(receipt.time).toISOString(), sellerBalance, log, receipt, balances, ctx);
  updateUserBalance("TRADE", BigInt(log.b_balance.liquid.base.toString()), BigInt(log.b_balance.liquid.quote.toString()), tai64ToDate(receipt.time).toISOString(), buyerBalance, log, receipt, balances, ctx);
}
