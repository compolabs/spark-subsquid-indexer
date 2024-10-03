import { CancelOrderEventOutput } from './abi/Market';
import { CancelOrderEvent, OrderStatus, ActiveBuyOrder, ActiveSellOrder, OrderType } from './model';
import tai64ToDate, { getIdentity, lookupOrder, lookupBalance, getHash } from './utils';
import { assertNotNull } from '@subsquid/util-internal'

export async function handleCancelOrderEvent(log: CancelOrderEventOutput, receipt: any, cancelOrderEvents: Map<string, any>, orders: Map<string, any>, activeBuyOrders: Map<string, any>, activeSellOrders: Map<string, any>, balances: Map<string, any>, ctx: any) {
 let event = new CancelOrderEvent({
  id: receipt.receiptId,
  market: receipt.id,
  orderId: log.order_id,
  user: getIdentity(log.user),
  baseAmount: BigInt(log.balance.liquid.base.toString()),
  quoteAmount: BigInt(log.balance.liquid.quote.toString()),
  txId: receipt.txId,
  timestamp: tai64ToDate(receipt.time).toISOString(),
 })
 cancelOrderEvents.set(event.id, event)

 let order = assertNotNull(await lookupOrder(ctx.store, orders, log.order_id))
 let balance = assertNotNull(await lookupBalance(ctx.store, balances, getHash(`${getIdentity(log.user)}-${receipt.id}`)))

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

 if (balance) {
  balance.baseAmount = BigInt(log.balance.liquid.base.toString());
  balance.quoteAmount = BigInt(log.balance.liquid.quote.toString());
  balance.timestamp = tai64ToDate(receipt.time).toISOString();
  balances.set(balance.id, balance);
 } else {
  return
 }
}
