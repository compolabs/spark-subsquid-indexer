import { CancelOrderEventOutput } from './abi/OrderbookAbi';
import { CancelOrderEvent, OrderStatus, Balance, ActiveBuyOrder, ActiveSellOrder, OrderType } from './model';
import tai64ToDate, { getIdentity, lookupOrder, lookupBalance } from './utils';
import { getHash } from './utils';
import { BASE_ASSET, QUOTE_ASSET, BASE_DECIMAL, PRICE_DECIMAL, QUOTE_DECIMAL } from './marketConfig';
import { assertNotNull } from '@subsquid/util-internal'

export async function handleCancelOrderEvent(log: CancelOrderEventOutput, receipt: any, cancelOrderEvents: Map<string, any>, orders: Map<string, any>, activeBuyOrders: Map<string, any>, activeSellOrders: Map<string, any>, balances: Map<string, any>, ctx: any) {
 let event = new CancelOrderEvent({
  id: receipt.receiptId,
  orderId: log.order_id,
  user: getIdentity(log.user),
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

  const quoteBalanceId = getHash(
   `${QUOTE_ASSET}-${getIdentity(log.user)}`
  );

  let quoteBalance = await lookupBalance(ctx.store, balances, quoteBalanceId)

  if (!quoteBalance) {
   console.log(
    `Cannot find a quote balance; user:${order.user}; asset: ${QUOTE_ASSET}; id: ${quoteBalanceId}`
   );
   return;
  }
  quoteBalance.amount += order.amount * order.price * BigInt(QUOTE_DECIMAL) / BigInt(PRICE_DECIMAL) / BigInt(BASE_DECIMAL);
  balances.set(quoteBalance.id, quoteBalance);


 } else if (order.orderType == OrderType.Sell) {
  await ctx.store.remove(ActiveSellOrder, order.id)
  activeSellOrders.delete(order.id)

  const baseBalanceId = getHash(
   `${BASE_ASSET}-${getIdentity(log.user)}`
  );

  let baseBalance = await lookupBalance(ctx.store, balances, baseBalanceId)

  if (!baseBalance) {
   console.log(
    `Cannot find a quote balance; user:${order.user}; asset: ${BASE_ASSET}; id: ${baseBalanceId}`
   );
   return;
  }
  baseBalance.amount += order.amount
  balances.set(baseBalance.id, baseBalance);
 }
}
