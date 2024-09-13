import { WithdrawEventOutput } from './abi/Orderbook';
import { WithdrawEvent} from './model';
import tai64ToDate, { getIdentity, lookupBalance } from './utils';

export async function handleWithdrawEvent(log: WithdrawEventOutput, receipt: any, withdrawEvents: Map<string, any>, balances: Map<string, any>, ctx: any) {
 let event = new WithdrawEvent({
  id: receipt.receiptId,
  txId: receipt.txId,
  amount: BigInt(log.amount.toString()),
  asset: log.asset.bits,
  baseAmount: BigInt(log.liquid_base.toString()),
  quoteAmount: BigInt(log.liquid_quote.toString()),
  user: getIdentity(log.user),
  timestamp: tai64ToDate(receipt.time).toISOString()
 })
 withdrawEvents.set(event.id, event)

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