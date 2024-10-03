import { OpenOrderEventOutput } from './abi/Orderbook';
import { Order, OrderStatus, ActiveBuyOrder, ActiveSellOrder, OrderType, OpenOrderEvent } from './model';
import tai64ToDate, { getHash, getIdentity, lookupBalance } from './utils';

export async function handleOpenOrderEvent(log: OpenOrderEventOutput, receipt: any, openOrderEvents: Map<string, any>, orders: Map<string, any>, activeBuyOrders: Map<string, any>, activeSellOrders: Map<string, any>, balances: Map<string, any>, ctx: any) {
 let event = new OpenOrderEvent({
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
  // asset: log.asset.bits,
 })
 openOrderEvents.set(event.id, event)

 let order = new Order({
  ...event,
  id: log.order_id,
  initialAmount: BigInt(log.amount.toString()),
  status: OrderStatus.Active,
 })
 orders.set(order.id, order);

 if (order.orderType == OrderType.Buy) {
  let buyOrder = new ActiveBuyOrder(order)
  activeBuyOrders.set(order.id, buyOrder)
 } else if (order.orderType === OrderType.Sell) {
  let sellOrder = new ActiveSellOrder(order)
  activeSellOrders.set(order.id, sellOrder)
 }

 let balance = await lookupBalance(ctx.store, balances, getHash(`${getIdentity(log.user)}-${receipt.id}`))

 if (balance) {
  balance.baseAmount = BigInt(log.balance.liquid.base.toString());
  balance.quoteAmount = BigInt(log.balance.liquid.quote.toString());
  balance.timestamp = tai64ToDate(receipt.time).toISOString();
  balances.set(balance.id, balance);
 } else {
  return
 }
}
