import { OpenOrderEventOutput } from './abi/Orderbook';
import { Order, OrderStatus, ActiveBuyOrder, ActiveSellOrder, OrderType, OpenOrderEvent } from './model';
import tai64ToDate, { getIdentity, lookupBalance } from './utils';

export async function handleOpenOrderEvent(log: OpenOrderEventOutput, receipt: any, openOrderEvents: Map<string, any>, orders: Map<string, any>, activeBuyOrders: Map<string, any>, activeSellOrders: Map<string, any>, balances: Map<string, any>, ctx: any) {
 let event = new OpenOrderEvent({
  id: receipt.receiptId,
  orderId: log.order_id,
  txId: receipt.txId,
  asset: log.asset.bits,
  amount: BigInt(log.amount.toString()),
  orderType: log.order_type as unknown as OrderType,
  baseAmount: BigInt(log.liquid_base.toString()),
  quoteAmount: BigInt(log.liquid_quote.toString()),
  price: BigInt(log.price.toString()),
  user: getIdentity(log.user),
  timestamp: tai64ToDate(receipt.time).toISOString(),
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

 let balance = await lookupBalance(ctx.store, balances, getIdentity(log.user))

 if (!balance) {
  return
 } else {
  balance.baseAmount = BigInt(log.liquid_base.toString());
  balance.quoteAmount = BigInt(log.liquid_quote.toString());
  balance.timestamp = tai64ToDate(receipt.time).toISOString();
 }
 balances.set(balance.id, balance);
}
