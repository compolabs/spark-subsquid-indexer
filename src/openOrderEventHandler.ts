import { OpenOrderEventOutput } from './abi/OrderbookAbi';
import { Order, OrderStatus, ActiveBuyOrder, ActiveSellOrder, Balance, OrderType, OpenOrderEvent } from './model';
import tai64ToDate, { getIdentity, lookupBalance } from './utils';
import { getHash } from './utils';
import { QUOTE_ASSET, BASE_ASSET, BASE_DECIMAL, QUOTE_DECIMAL, PRICE_DECIMAL } from './marketConfig';

export async function handleOpenOrderEvent(log: OpenOrderEventOutput, receipt: any, openOrderEvents: Map<string, any>, orders: Map<string, any>, activeBuyOrders: Map<string, any>, activeSellOrders: Map<string, any>, balances: Map<string, any>, ctx: any) {
 let event = new OpenOrderEvent({
  id: receipt.receiptId,
  orderId: log.order_id,
  txId: receipt.txId,
  asset: log.asset.bits,
  amount: BigInt(log.amount.toString()),
  orderType: log.order_type as unknown as OrderType,
  price: BigInt(log.price.toString()),
  user: getIdentity(log.user),
  timestamp: tai64ToDate(receipt.time).toISOString(),
 })
 openOrderEvents.set(event.id, event)

 let order = {
  ...event,
  id: log.order_id,
  initialAmount: BigInt(log.amount.toString()),
  status: OrderStatus.Active,
 }
 orders.set(order.id, new Order(order))

 if (order.orderType == OrderType.Buy) {
  let buyOrder = new ActiveBuyOrder(order)
  activeBuyOrders.set(order.id, buyOrder)
 } else if (order.orderType === OrderType.Sell) {
  let sellOrder = new ActiveSellOrder(order)
  activeSellOrders.set(order.id, sellOrder)
 }

 if (order.orderType == OrderType.Buy) {
  const balanceId = getHash(`${QUOTE_ASSET}-${getIdentity(log.user)}`);
  let balance = await lookupBalance(ctx.store, balances, balanceId)

  if (!balance) {
   console.log(
    `Cannot find a balance; user:${getIdentity(log.user)}; asset: ${QUOTE_ASSET}; id: ${balanceId}`
   );
   return;
  }
  const updatedAmount = balance.amount - BigInt(log.amount.toString()) * BigInt(log.price.toString()) * BigInt(QUOTE_DECIMAL) / BigInt(BASE_DECIMAL) / BigInt(PRICE_DECIMAL);
  balance.amount = updatedAmount;
  balances.set(balance.id, balance);


 } else if (order.orderType === OrderType.Sell) {
  const balanceId = getHash(`${BASE_ASSET}-${getIdentity(log.user)}`);
  let balance = await lookupBalance(ctx.store, balances, balanceId)

  if (!balance) {
   console.log(
    `Cannot find a balance; user:${getIdentity(log.user)}; asset: ${BASE_ASSET}; id: ${balanceId}`
   );
   return;
  }

  const updatedAmount = balance.amount - BigInt(log.amount.toString());
  balance.amount = updatedAmount;
  balances.set(balance.id, balance);
 }
}
