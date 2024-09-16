import { CancelOrderEventOutput } from './abi/Orderbook';
import { CancelOrderEvent, OrderStatus, ActiveBuyOrder, ActiveSellOrder, OrderType } from './model';
import tai64ToDate, { getIdentity, lookupOrder, lookupBalance } from './utils';
import { assertNotNull } from '@subsquid/util-internal'

export async function handleCancelOrderEvent(log: CancelOrderEventOutput, receipt: any, cancelOrderEvents: Map<string, any>, orders: Map<string, any>, activeBuyOrders: Map<string, any>, activeSellOrders: Map<string, any>, balances: Map<string, any>, ctx: any) {
 let event = new CancelOrderEvent({
  id: receipt.receiptId,
  orderId: log.order_id,
  user: getIdentity(log.user),
  baseAmount: BigInt(log.liquid_base.toString()),
  quoteAmount: BigInt(log.liquid_quote.toString()),
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

 let balance = await lookupBalance(ctx.store, balances, getIdentity(log.user))

 if (!balance) {
  return
 }

 balance.baseAmount = BigInt(log.liquid_base.toString());
 balance.quoteAmount = BigInt(log.liquid_quote.toString());
 balance.timestamp = tai64ToDate(receipt.time).toISOString();

 balances.set(balance.id, balance);
}
