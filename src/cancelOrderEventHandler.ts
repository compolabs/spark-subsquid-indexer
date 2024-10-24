import { nanoid } from 'nanoid';
import type { CancelOrderEventOutput } from './abi/Market';
import { CancelOrderEvent, OrderStatus, ActiveBuyOrder, ActiveSellOrder, OrderType, type Order, type Balance} from './model';
import tai64ToDate, { getIdentity, lookupOrder, lookupBalance, getHash, lookupBuyOrder, lookupSellOrder, updateUserBalance } from './utils';
import { assertNotNull } from '@subsquid/util-internal'

export async function handleCancelOrderEvent(log: CancelOrderEventOutput, receipt: any, cancelOrderEvents: Map<string, CancelOrderEvent>, orders: Map<string, Order>, activeBuyOrders: Map<string, ActiveBuyOrder>, activeSellOrders: Map<string, ActiveSellOrder>, balances: Map<string, Balance>, ctx: any) {

  // Construct the CancelOrderEvent and save in context for tracking
  const event = new CancelOrderEvent({
    id: getHash(`${receipt.txId}-${nanoid()}`),
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
  const order = assertNotNull(await lookupOrder(ctx.store, orders, log.order_id))
  const balance = assertNotNull(await lookupBalance(ctx.store, balances, getHash(`${getIdentity(log.user)}-${receipt.id}`)))
  let activeOrder = null;
  if (order.orderType === OrderType.Buy) {
    activeOrder = await lookupBuyOrder(ctx.store, activeBuyOrders, log.order_id);
  } else if (order.orderType === OrderType.Sell) {
    activeOrder = await lookupSellOrder(ctx.store, activeSellOrders, log.order_id);
  }

  if (activeOrder) {
    if (activeOrder.orderType === OrderType.Buy) {
      await ctx.store.remove(ActiveBuyOrder, activeOrder.id);
      activeBuyOrders.delete(activeOrder.id);
    } else if (activeOrder.orderType === OrderType.Sell) {
      await ctx.store.remove(ActiveSellOrder, activeOrder.id);
      activeSellOrders.delete(activeOrder.id);
    }
  } else {
    ctx.log.warn(`NO ACTIVE ORDER CANCEL ${log.order_id}`);
  }

  // If the order exists, update its status to "Canceled" and reset its amount to 0
  if (order) {
    order.amount = 0n
    order.status = OrderStatus.Canceled
    order.timestamp = tai64ToDate(receipt.time).toISOString()
    orders.set(order.id, order);
  } else {
    ctx.log.warn(`NO ORDER CANCEL ${log.order_id}`);
  }

  // If the user's balance exists, update the balance with the new base and quote amounts
  updateUserBalance("CANCEL", BigInt(log.balance.liquid.base.toString()), BigInt(log.balance.liquid.quote.toString()), tai64ToDate(receipt.time).toISOString(), balance, log, receipt, balances, ctx);
}
