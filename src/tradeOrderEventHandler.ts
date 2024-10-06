import { TradeOrderEventOutput } from './abi/Market';
import { TradeOrderEvent, OrderStatus, ActiveBuyOrder, ActiveSellOrder } from './model';
import tai64ToDate, { getIdentity, lookupOrder, lookupBalance, lookupBuyOrder, lookupSellOrder, getHash } from './utils';
import { assertNotNull } from '@subsquid/util-internal'

export async function handleTradeOrderEvent(log: TradeOrderEventOutput, receipt: any, tradeOrderEvents: Map<string, any>, orders: Map<string, any>, activeBuyOrders: Map<string, any>, activeSellOrders: Map<string, any>, balances: Map<string, any>, ctx: any) {
 
 // Construct the TradeOrderEvent and save in context for tracking
 let event = new TradeOrderEvent({
  id: receipt.receiptId,
  market: receipt.id,
  sellOrderId: log.base_sell_order_id,
  buyOrderId: log.base_buy_order_id,
  tradeSize: BigInt(log.trade_size.toString()),
  tradePrice: BigInt(log.trade_price.toString()),
  seller: getIdentity(log.order_seller),
  buyer: getIdentity(log.order_buyer),
  sellerBaseAmount: BigInt(log.s_balance.liquid.base.toString()),
  sellerQuoteAmount: BigInt(log.s_balance.liquid.quote.toString()),
  buyerBaseAmount: BigInt(log.b_balance.liquid.base.toString()),
  buyerQuoteAmount: BigInt(log.b_balance.liquid.quote.toString()),
  txId: receipt.txId,
  timestamp: tai64ToDate(receipt.time).toISOString(),
 })
 tradeOrderEvents.set(event.id, event)

 // Retrieve the buy and sell orders
 let sellOrder = assertNotNull(await lookupOrder(ctx.store, orders, log.base_sell_order_id))
 let buyOrder = assertNotNull(await lookupOrder(ctx.store, orders, log.base_buy_order_id))

 // Retrieve the balances for both the seller and the buyer
 let seller_balance = assertNotNull(await lookupBalance(ctx.store, balances, getHash(`${getIdentity(log.order_seller)}-${receipt.id}`)))
 let buyer_balance = assertNotNull(await lookupBalance(ctx.store, balances, getHash(`${getIdentity(log.order_buyer)}-${receipt.id}`)))

 // Update the sell order status to "Closed" if fully executed, otherwise "Active"
 let updatedSellAmount = sellOrder.amount - event.tradeSize
 const isSellOrderClosed = updatedSellAmount === 0n
 let updatedSellOrder = {
  updatedSellAmount,
  status: updatedSellAmount === 0n ? OrderStatus.Closed : OrderStatus.Active,
  timestamp: tai64ToDate(receipt.time).toISOString(),
 }
 Object.assign(sellOrder, updatedSellOrder)

 // Remove the sell order from active orders if fully executed
 if (isSellOrderClosed) {
  await ctx.store.remove(ActiveSellOrder, log.base_sell_order_id)
  activeSellOrders.delete(log.base_sell_order_id)
 } else {
  let sellOrder = assertNotNull(await lookupSellOrder(ctx.store, activeSellOrders, log.base_sell_order_id))
  Object.assign(sellOrder, updatedSellOrder)
 }

 // Update the buy order status to "Closed" if fully executed, otherwise "Active"
 let updatedBuyAmount = buyOrder.amount - event.tradeSize
 const isBuyOrderClosed = updatedBuyAmount === 0n
 let updatedBuyOrder = {
  updatedBuyAmount,
  status: updatedBuyAmount === 0n ? OrderStatus.Closed : OrderStatus.Active,
  timestamp: tai64ToDate(receipt.time).toISOString(),
 }
 Object.assign(buyOrder, updatedBuyOrder)

 // Remove the buy order from active orders if fully executed
 if (isBuyOrderClosed) {
  await ctx.store.remove(ActiveBuyOrder, log.base_buy_order_id)
  activeBuyOrders.delete(log.base_buy_order_id)
 } else {
  let buyOrder = assertNotNull(await lookupBuyOrder(ctx.store, activeBuyOrders, log.base_buy_order_id))
  Object.assign(buyOrder, updatedBuyOrder)
 }

 // Update the seller's balance with the new base and quote amounts
 if (seller_balance) {
  seller_balance.baseAmount = BigInt(log.s_balance.liquid.base.toString());
  seller_balance.quoteAmount = BigInt(log.s_balance.liquid.quote.toString());
  seller_balance.timestamp = tai64ToDate(receipt.time).toISOString();
  balances.set(seller_balance.id, seller_balance);
 } else {
  return
 }

 // Update the buyer's balance with the new base and quote amounts
 if (buyer_balance) {
  buyer_balance.baseAmount = BigInt(log.b_balance.liquid.base.toString());
  buyer_balance.quoteAmount = BigInt(log.b_balance.liquid.quote.toString());
  buyer_balance.timestamp = tai64ToDate(receipt.time).toISOString();
  balances.set(buyer_balance.id, buyer_balance);
 } else {
  return
 }
}
