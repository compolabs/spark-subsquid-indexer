import { DepositEventOutput } from './abi/Orderbook';
import { DepositEvent, Balance } from './model';
import tai64ToDate, { getHash, getIdentity, lookupBalance } from './utils';

export async function handleDepositEvent(log: DepositEventOutput, receipt: any, depositEvents: Map<string, any>, balances: Map<string, any>, ctx: any) {
 // console.log(`Market (contract): ${receipt.id}`);
 // console.log(`Market (contract): ${receipt.receiptId}`);
 let event = new DepositEvent({
  id: receipt.receiptId,
  market: receipt.id,
  user: getIdentity(log.user),
  amount: BigInt(log.amount.toString()),
  baseAmount: BigInt(log.balance.liquid.base.toString()),
  quoteAmount: BigInt(log.balance.liquid.quote.toString()),
  asset: log.asset.bits,
  txId: receipt.txId,
  timestamp: tai64ToDate(receipt.time).toISOString(),
 })
 depositEvents.set(event.id, event)

 const balanceId = getHash(`${getIdentity(log.user)}-${receipt.id}`);
 let balance = await lookupBalance(ctx.store, balances, balanceId)

 if (balance) {
  balance.baseAmount = BigInt(log.balance.liquid.base.toString());
  balance.quoteAmount = BigInt(log.balance.liquid.quote.toString());
  balance.timestamp = tai64ToDate(receipt.time).toISOString();
 } else {
  balance = new Balance({
   ...event,
   id: balanceId,
  });
 }
 balances.set(balance.id, balance);
}
