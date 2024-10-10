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
 let sellOrder = await lookupOrder(ctx.store, orders, log.base_sell_order_id)
 let buyOrder = await lookupOrder(ctx.store, orders, log.base_buy_order_id)
 let sellOrderActive = await lookupSellOrder(ctx.store, activeSellOrders, log.base_sell_order_id)
 let buyOrderActive = await lookupBuyOrder(ctx.store, activeBuyOrders, log.base_sell_order_id)

 // Retrieve the balances for both the seller and the buyer
 let seller_balance = assertNotNull(await lookupBalance(ctx.store, balances, getHash(`${getIdentity(log.order_seller)}-${receipt.id}`)))
 let buyer_balance = assertNotNull(await lookupBalance(ctx.store, balances, getHash(`${getIdentity(log.order_buyer)}-${receipt.id}`)))

 // Update the sell order status to "Closed" if fully executed, otherwise "Active"
 if (sellOrder) {
  let updatedSellAmount = sellOrder.amount - event.tradeSize
  sellOrder.amount = sellOrder.amount - event.tradeSize
  sellOrder.status = updatedSellAmount === 0n ? OrderStatus.Closed : OrderStatus.Active
  sellOrder.timestamp = tai64ToDate(receipt.time).toISOString()
  orders.set(sellOrder.id, sellOrder);
 } else {
  ctx.log.warn(`NO SELL ORDER TRADE FOR USER: ${getIdentity(log.order_seller)} ORDER ID: ${log.base_sell_order_id} MARKET: ${receipt.id}.`);
 }

 if (sellOrderActive) {
  let updatedSellActiveAmount = sellOrderActive.amount - event.tradeSize
  const isSellOrderClosed = updatedSellActiveAmount === 0n
  sellOrderActive.amount = sellOrderActive.amount - event.tradeSize
  sellOrderActive.status = updatedSellActiveAmount === 0n ? OrderStatus.Closed : OrderStatus.Active
  sellOrderActive.timestamp = tai64ToDate(receipt.time).toISOString()
  activeSellOrders.set(sellOrderActive.id, sellOrderActive);

  if (isSellOrderClosed) {
   await ctx.store.remove(ActiveSellOrder, log.base_sell_order_id)
   activeSellOrders.delete(log.base_sell_order_id)
  } else {
   activeSellOrders.set(sellOrderActive.id, sellOrderActive);
  }
 } else {
  ctx.log.warn(`NO SELL ORDER ACTIVE TRADE FOR USER: ${getIdentity(log.order_seller)} ORDER ID: ${log.base_sell_order_id} MARKET: ${receipt.id}.`);
 }

 if (buyOrder) {
  let updatedBuyAmount = buyOrder.amount - event.tradeSize
  buyOrder.amount = buyOrder.amount - event.tradeSize
  buyOrder.status = updatedBuyAmount === 0n ? OrderStatus.Closed : OrderStatus.Active
  buyOrder.timestamp = tai64ToDate(receipt.time).toISOString()
  orders.set(buyOrder.id, buyOrder);
 } else {
  ctx.log.warn(`NO BUY ORDER TRADE FOR USER: ${getIdentity(log.order_buyer)} ORDER ID: ${log.base_buy_order_id} MARKET: ${receipt.id}.`);
 }

 if (buyOrderActive) {
  let updatedBuyActiveAmount = buyOrderActive.amount - event.tradeSize
  const isBuyOrderClosed = updatedBuyActiveAmount === 0n
  buyOrderActive.amount = buyOrderActive.amount - event.tradeSize
  buyOrderActive.status = updatedBuyActiveAmount === 0n ? OrderStatus.Closed : OrderStatus.Active
  buyOrderActive.timestamp = tai64ToDate(receipt.time).toISOString()
  activeBuyOrders.set(buyOrderActive.id, buyOrderActive);

  if (isBuyOrderClosed) {
   await ctx.store.remove(ActiveBuyOrder, log.base_buy_order_id)
   activeBuyOrders.delete(log.base_buy_order_id)
  } else {
   activeBuyOrders.set(buyOrderActive.id, buyOrderActive);
  }
 } else {
  ctx.log.warn(`NO BUY ORDER ACTIVE TRADE FOR USER: ${getIdentity(log.order_buyer)} ORDER ID: ${log.base_buy_order_id} MARKET: ${receipt.id}.`);
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
