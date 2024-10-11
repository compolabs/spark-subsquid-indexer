import type { OpenOrderEventOutput } from './abi/Market';
import { Order, OrderStatus, ActiveBuyOrder, ActiveSellOrder, OrderType, OpenOrderEvent } from './model';
import tai64ToDate, { getHash, getIdentity, lookupBalance } from './utils';
import { assertNotNull } from '@subsquid/util-internal'

export async function handleOpenOrderEvent(log: OpenOrderEventOutput, receipt: any, openOrderEvents: Map<string, any>, orders: Map<string, any>, activeBuyOrders: Map<string, any>, activeSellOrders: Map<string, any>, balances: Map<string, any>, ctx: any) {

  // Construct the OpenOrderEvent and save in context for tracking
  const event = new OpenOrderEvent({
    id: receipt.receiptId,
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
    activeBuyOrders.set(order.id, buyOrder)
  } else if (order.orderType === OrderType.Sell) {
    const sellOrder = new ActiveSellOrder(order)
    activeSellOrders.set(order.id, sellOrder)
  }

  // If a balance exists, update it with the new base and quote amounts
  if (balance) {
    balance.baseAmount = BigInt(log.balance.liquid.base.toString());
    balance.quoteAmount = BigInt(log.balance.liquid.quote.toString());
    balance.timestamp = tai64ToDate(receipt.time).toISOString();
    balances.set(balance.id, balance);
  } else {
    ctx.log.warn(`NO BALANCE OPEN FOR USER: ${getIdentity(log.user)} BALANCE ID: ${getHash(`${getIdentity(log.user)}-${receipt.id}`)} MARKET: ${receipt.id}.`);
  }
}
