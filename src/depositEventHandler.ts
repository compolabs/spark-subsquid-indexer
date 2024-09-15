import { DepositEventOutput } from './abi/Orderbook';
import { DepositEvent, Balance } from './model';
import tai64ToDate, { getIdentity, lookupBalance } from './utils';

export async function handleDepositEvent(log: DepositEventOutput, receipt: any, depositEvents: Map<string, any>, balances: Map<string, any>, ctx: any) {
 let event = new DepositEvent({
  id: receipt.receiptId,
  user: getIdentity(log.user),
  amount: BigInt(log.amount.toString()),
  baseAmount: BigInt(log.liquid_base.toString()),
  quoteAmount: BigInt(log.liquid_quote.toString()),
  asset: log.asset.bits,
  txId: receipt.txId,
  timestamp: tai64ToDate(receipt.time).toISOString(),
 })
 depositEvents.set(event.id, event)

 let balance = await lookupBalance(ctx.store, balances, getIdentity(log.user))

 if (!balance) {
  balance = new Balance({
   ...event,
   id: getIdentity(log.user),
  });

 } else {
  balance.baseAmount = BigInt(log.liquid_base.toString());
  balance.quoteAmount = BigInt(log.liquid_quote.toString());
  balance.timestamp = tai64ToDate(receipt.time).toISOString();
 }
 balances.set(balance.id, balance);
 }
