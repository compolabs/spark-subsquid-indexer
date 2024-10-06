import { WithdrawEventOutput } from './abi/Market';
import { WithdrawEvent } from './model';
import tai64ToDate, { getHash, getIdentity, lookupBalance } from './utils';

export async function handleWithdrawEvent(log: WithdrawEventOutput, receipt: any, withdrawEvents: Map<string, any>, balances: Map<string, any>, ctx: any) {

 // Construct the WithdrawEvent and save in context for tracking
 let event = new WithdrawEvent({
  id: receipt.receiptId,
  market: receipt.id,
  user: getIdentity(log.user),
  amount: BigInt(log.amount.toString()),
  baseAmount: BigInt(log.account.liquid.base.toString()),
  quoteAmount: BigInt(log.account.liquid.quote.toString()),
  asset: log.asset.bits,
  txId: receipt.txId,
  timestamp: tai64ToDate(receipt.time).toISOString()
 })
 withdrawEvents.set(event.id, event)

 // Retrieve the user's balance
 let balance = await lookupBalance(ctx.store, balances, getHash(`${getIdentity(log.user)}-${receipt.id}`))

 // If a balance exists, update it with the new base and quote amounts
 if (balance) {
  balance.baseAmount = BigInt(log.account.liquid.base.toString());
  balance.quoteAmount = BigInt(log.account.liquid.quote.toString());
  balance.timestamp = tai64ToDate(receipt.time).toISOString();
  balances.set(balance.id, balance);
 } else {
  return
 }
}