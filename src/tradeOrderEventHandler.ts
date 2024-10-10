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
 let sellActiveOrder = assertNotNull(await lookupSellOrder(ctx.store, activeSellOrders, log.base_sell_order_id))
 let sellOrder = assertNotNull(await lookupOrder(ctx.store, orders, log.base_sell_order_id))
 let buyActiveOrder = assertNotNull(await lookupBuyOrder(ctx.store, activeBuyOrders, log.base_buy_order_id))
 let buyOrder = assertNotNull(await lookupOrder(ctx.store, orders, log.base_buy_order_id))

 // Retrieve the balances for both the seller and the buyer
 let seller_balance = assertNotNull(await lookupBalance(ctx.store, balances, getHash(`${getIdentity(log.order_seller)}-${receipt.id}`)))
 let buyer_balance = assertNotNull(await lookupBalance(ctx.store, balances, getHash(`${getIdentity(log.order_buyer)}-${receipt.id}`)))

 // Update the sell order and sell active order status to "Closed" if fully executed, otherwise "Active"
 let updatedSellAmount = sellOrder.amount - event.tradeSize
 sellOrder.amount = sellOrder.amount - event.tradeSize
 sellOrder.status = updatedSellAmount === 0n ? OrderStatus.Closed : OrderStatus.Active
 sellOrder.timestamp = tai64ToDate(receipt.time).toISOString()
 orders.set(sellOrder.id, sellOrder);

 let updatedActiveSellAmount = sellActiveOrder.amount - event.tradeSize
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

 // Update the buy order and buy active order status to "Closed" if fully executed, otherwise "Active"
 let updatedBuyAmount = buyOrder.amount - event.tradeSize
 buyOrder.amount = buyOrder.amount - event.tradeSize
 buyOrder.status = updatedBuyAmount === 0n ? OrderStatus.Closed : OrderStatus.Active
 buyOrder.timestamp = tai64ToDate(receipt.time).toISOString()
 orders.set(buyOrder.id, buyOrder);

 let updatedActiveBuyAmount = buyActiveOrder.amount - event.tradeSize
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

 // Update the seller's balance with the new base and quote amounts
 if (seller_balance) {
  seller_balance.baseAmount = BigInt(log.s_balance.liquid.base.toString());
  seller_balance.quoteAmount = BigInt(log.s_balance.liquid.quote.toString());
  seller_balance.timestamp = tai64ToDate(receipt.time).toISOString();
  balances.set(seller_balance.id, seller_balance);
 } else {
  ctx.log.warn(`NO BALANCE TRADE FOR USER: ${getIdentity(log.order_seller)} BALANCE ID: ${getHash(`${getIdentity(log.order_seller)}-${receipt.id}`)} MARKET: ${receipt.id}.`);
 }

 // Update the buyer's balance with the new base and quote amounts
 if (buyer_balance) {
  buyer_balance.baseAmount = BigInt(log.b_balance.liquid.base.toString());
  buyer_balance.quoteAmount = BigInt(log.b_balance.liquid.quote.toString());
  buyer_balance.timestamp = tai64ToDate(receipt.time).toISOString();
  balances.set(buyer_balance.id, buyer_balance);
 } else {
  ctx.log.warn(`NO BALANCE TRADE FOR USER: ${getIdentity(log.order_buyer)} BALANCE ID: ${getHash(`${getIdentity(log.order_buyer)}-${receipt.id}`)} MARKET: ${receipt.id}.`);
 }
}
