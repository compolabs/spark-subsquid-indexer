import { DepositEventOutput } from './abi/OrderbookAbi';
import { DepositEvent, Balance } from './model';
import tai64ToDate, { getIdentity, lookupBalance } from './utils';
import { getHash } from './utils';
import { BASE_ASSET, QUOTE_ASSET } from './marketConfig';

export async function handleDepositEvent(log: DepositEventOutput, receipt: any, depositEvents: Map<string, any>, balances: Map<string, any>, ctx: any) {
 let event = new DepositEvent({
  id: receipt.receiptId,
  txId: receipt.txId,
  amount: BigInt(log.amount.toString()),
  asset: log.asset.bits,
  user: getIdentity(log.user),
  timestamp: tai64ToDate(receipt.time).toISOString(),
 })
 depositEvents.set(event.id, event)

 const asset = log.asset.bits;
 const isBaseAsset = asset === BASE_ASSET;

 const balanceId = isBaseAsset
  ? getHash(`${BASE_ASSET}-${getIdentity(log.user)}`)
  : getHash(`${QUOTE_ASSET}-${getIdentity(log.user)}`);

 let balance = await lookupBalance(ctx.store, balances, balanceId)
 if (balance) {
  balance.amount += BigInt(log.amount.toString())
 } else {
  balance = new Balance({
   id: balanceId,
   amount: BigInt(log.amount.toString()),
   asset: log.asset.bits,
   user: getIdentity(log.user),
   timestamp: tai64ToDate(receipt.time).toISOString(),
  })
  balances.set(balance.id, balance)
 }
}
