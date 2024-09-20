import { WithdrawEventOutput } from './abi/Orderbook';
import { WithdrawEvent} from './model';
import tai64ToDate, { getIdentity, lookupBalance } from './utils';

export async function handleWithdrawEvent(log: WithdrawEventOutput, receipt: any, withdrawEvents: Map<string, any>, balances: Map<string, any>, ctx: any) {
 let event = new WithdrawEvent({
  id: receipt.receiptId,
  user: getIdentity(log.user),
  amount: BigInt(log.amount.toString()),
  baseAmount: BigInt(log.balance.liquid.base.toString()),
  quoteAmount: BigInt(log.balance.liquid.quote.toString()),
  asset: log.asset.bits,
  txId: receipt.txId,
  timestamp: tai64ToDate(receipt.time).toISOString()
 })
 withdrawEvents.set(event.id, event)

 let balance = await lookupBalance(ctx.store, balances, getIdentity(log.user))

 if (!balance) {
  return
 } else {
  balance.baseAmount = BigInt(log.balance.liquid.base.toString());
  balance.quoteAmount = BigInt(log.balance.liquid.quote.toString());
  balance.timestamp = tai64ToDate(receipt.time).toISOString();
 }
 balances.set(balance.id, balance);
}