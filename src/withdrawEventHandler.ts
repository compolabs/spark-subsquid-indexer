import { WithdrawEventOutput } from './abi/Orderbook';
import { WithdrawEvent } from './model';
import tai64ToDate, { getHash, getIdentity, lookupBalance } from './utils';

export async function handleWithdrawEvent(log: WithdrawEventOutput, receipt: any, withdrawEvents: Map<string, any>, balances: Map<string, any>, ctx: any) {
 let event = new WithdrawEvent({
  id: receipt.receiptId,
  market: receipt.id,
  user: getIdentity(log.user),
  amount: BigInt(log.amount.toString()),
  baseAmount: BigInt(log.balance.liquid.base.toString()),
  quoteAmount: BigInt(log.balance.liquid.quote.toString()),
  asset: log.asset.bits,
  txId: receipt.txId,
  timestamp: tai64ToDate(receipt.time).toISOString()
 })
 withdrawEvents.set(event.id, event)

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