import { CancelOrderEventOutput } from './abi/Market';
import { CancelOrderEvent, OrderStatus, ActiveBuyOrder, ActiveSellOrder, OrderType } from './model';
import tai64ToDate, { getIdentity, lookupOrder, lookupBalance, getHash } from './utils';
import { assertNotNull } from '@subsquid/util-internal'

export async function handleCancelOrderEvent(log: CancelOrderEventOutput, receipt: any, cancelOrderEvents: Map<string, any>, orders: Map<string, any>, activeBuyOrders: Map<string, any>, activeSellOrders: Map<string, any>, balances: Map<string, any>, ctx: any) {

 // Construct the CancelOrderEvent and save in context for tracking
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

 // Retrieve the users's order and balance
 let order = assertNotNull(await lookupOrder(ctx.store, orders, log.order_id))
 let balance = assertNotNull(await lookupBalance(ctx.store, balances, getHash(`${getIdentity(log.user)}-${receipt.id}`)))

 // If the order exists, update its status to "Canceled" and reset its amount to 0
 order.amount = 0n
 order.status = OrderStatus.Canceled
 order.timestamp = tai64ToDate(receipt.time).toISOString()
 orders.set(order.id, order);

 // Remove the order from active orders depending on its type (Buy/Sell)
 if (order.orderType == OrderType.Buy) {
  await ctx.store.remove(ActiveBuyOrder, order.id)
  activeBuyOrders.delete(order.id)
 } else if (order.orderType == OrderType.Sell) {
  await ctx.store.remove(ActiveSellOrder, order.id)
  activeSellOrders.delete(order.id)
 }

 // If the user's balance exists, update the balance with the new base and quote amounts
 if (balance) {
  balance.baseAmount = BigInt(log.balance.liquid.base.toString());
  balance.quoteAmount = BigInt(log.balance.liquid.quote.toString());
  balance.timestamp = tai64ToDate(receipt.time).toISOString();
  balances.set(balance.id, balance);
 } else {
  return
 }
}
