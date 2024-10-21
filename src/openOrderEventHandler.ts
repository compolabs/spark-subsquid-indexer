import { nanoid } from 'nanoid';
import type { OpenOrderEventOutput } from './abi/Market';
import { Order, OrderStatus, ActiveBuyOrder, ActiveSellOrder, OrderType, OpenOrderEvent, type Balance } from './model';
import tai64ToDate, { getHash, getIdentity, lookupBalance, updateUserBalance } from './utils';
import { assertNotNull } from '@subsquid/util-internal'

export async function handleOpenOrderEvent(log: OpenOrderEventOutput, receipt: any, openOrderEvents: Map<string, OpenOrderEvent>, orders: Map<string, Order>, activeBuyOrders: Map<string, ActiveBuyOrder>, activeSellOrders: Map<string, ActiveSellOrder>, balances: Map<string, Balance>, ctx: any) {

  // Construct the OpenOrderEvent and save in context for tracking
  const event = new OpenOrderEvent({
    id: getHash(`${receipt.txId}-${nanoid()}`),
    market: receipt.id,
    orderId: log.order_id,
    orderType: log.order_type as unknown as OrderType,
    user: getIdentity(log.user),
    amount: BigInt(log.amount.toString()),
    price: BigInt(log.price.toString()),
    baseAmount: BigInt(log.balance.liquid.base.toString()),
    quoteAmount: BigInt(log.balance.liquid.quote.toString()),
    txId: receipt.txId,
    timestamp: tai64ToDate(receipt.time).toISOString(),
  })
  openOrderEvents.set(event.id, event)

  // Retrieve the user's balance
  const balanceId = getHash(`${getIdentity(log.user)}-${receipt.id}`);
  const balance = assertNotNull(await lookupBalance(ctx.store, balances, balanceId))

  // Construct the Order object and save in context for tracking
  const order = new Order({
    ...event,
    id: log.order_id,
    initialAmount: BigInt(log.amount.toString()),
    status: OrderStatus.Active,
  })
  orders.set(order.id, order);

  // Save the order in separate collections based on order type (Buy or Sell)
  if (order.orderType === OrderType.Buy) {
    const buyOrder = new ActiveBuyOrder(order)
    activeBuyOrders.set(buyOrder.id, buyOrder)
  } else if (order.orderType === OrderType.Sell) {
    const sellOrder = new ActiveSellOrder(order)
    activeSellOrders.set(sellOrder.id, sellOrder)
  }

  // If a balance exists, update it with the new base and quote amounts
  updateUserBalance("OPEN", BigInt(log.balance.liquid.base.toString()), BigInt(log.balance.liquid.quote.toString()), tai64ToDate(receipt.time).toISOString(), balance, log, receipt, balances, ctx);
}
