import { WithdrawEventOutput } from './abi/OrderbookAbi';
import { WithdrawEvent, Balance } from './model';
import tai64ToDate, { getIdentity, lookupBalance } from './utils';
import { getHash } from './utils';
import { BASE_ASSET, QUOTE_ASSET } from './marketConfig';
import { assertNotNull } from '@subsquid/util-internal'

export async function handleWithdrawEvent(log: WithdrawEventOutput, receipt: any, withdrawEvents: Map<string, any>, balances: Map<string, any>, ctx: any) {
 let event = new WithdrawEvent({
  id: receipt.receiptId,
  txId: receipt.txId,
  amount: BigInt(log.amount.toString()),
  asset: log.asset.bits,
  user: getIdentity(log.user),
  timestamp: tai64ToDate(receipt.time).toISOString()
 })
 withdrawEvents.set(event.id, event)

 const asset = log.asset.bits;
 const isBaseAsset = asset === BASE_ASSET;

 const balanceId = isBaseAsset
  ? getHash(`${BASE_ASSET}-${getIdentity(log.user)}`)
  : getHash(`${QUOTE_ASSET}-${getIdentity(log.user)}`);

 let balance = assertNotNull(await lookupBalance(ctx.store, balances, balanceId))
 balance.amount -= BigInt(log.amount.toString())
}