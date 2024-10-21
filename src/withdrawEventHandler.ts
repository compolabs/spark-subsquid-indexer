import { nanoid } from 'nanoid';
import type { WithdrawEventOutput } from './abi/Market';
import { type Balance, WithdrawEvent } from './model';
import tai64ToDate, { getHash, getIdentity, lookupBalance, updateUserBalance } from './utils';
import { assertNotNull } from '@subsquid/util-internal'

export async function handleWithdrawEvent(log: WithdrawEventOutput, receipt: any, withdrawEvents: Map<string, WithdrawEvent>, balances: Map<string, Balance>, ctx: any) {

  // Construct the WithdrawEvent and save in context for tracking
  const event = new WithdrawEvent({
    id: getHash(`${receipt.txId}-${nanoid()}`),
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
  const balance = assertNotNull(await lookupBalance(ctx.store, balances, getHash(`${getIdentity(log.user)}-${receipt.id}`)))

  // If a balance exists, update it with the new base and quote amounts
  updateUserBalance("WITHDRAW", BigInt(log.account.liquid.base.toString()), BigInt(log.account.liquid.quote.toString()), tai64ToDate(receipt.time).toISOString(), balance, log, receipt, balances, ctx);
}
