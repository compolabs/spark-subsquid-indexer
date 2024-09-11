import { TradeOrderEventOutput } from './abi/OrderbookAbi';
import { TradeOrderEvent, OrderStatus, Balance, ActiveBuyOrder, ActiveSellOrder } from './model';
import tai64ToDate, { getIdentity, lookupOrder, lookupBalance, lookupBuyOrder, lookupSellOrder } from './utils';
import { getHash } from './utils';
import { BASE_ASSET, QUOTE_ASSET, BASE_DECIMAL, PRICE_DECIMAL, QUOTE_DECIMAL } from './marketConfig';
import { assertNotNull } from '@subsquid/util-internal'

export async function handleTradeOrderEvent(log: TradeOrderEventOutput, receipt: any, tradeOrderEvents: Map<string, any>, orders: Map<string, any>, activeBuyOrders: Map<string, any>, activeSellOrders: Map<string, any>, balances: Map<string, any>, ctx: any) {
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
}
