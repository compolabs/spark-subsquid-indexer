import { nanoid } from 'nanoid';
import type { WithdrawToMarketEventOutput } from './abi/Market';
import { type Balance, WithdrawToMarketEvent } from './model';
import tai64ToDate, { getHash, getIdentity, lookupBalance, updateUserBalance } from './utils';

export async function handleWithdrawToMarketEvent(log: WithdrawToMarketEventOutput, receipt: any, withdrawToMarketEvents: Map<string, WithdrawToMarketEvent>, balances: Map<string, Balance>, ctx: any) {

  // Construct the WithdrawToMarketEvent and save in context for tracking
  const event = new WithdrawToMarketEvent({
    id: getHash(`${receipt.txId}-${nanoid()}`),
    market: receipt.id,
    toMarket: log.market.bits,
    user: getIdentity(log.user),
    amount: BigInt(log.amount.toString()),
    baseAmount: BigInt(log.account.liquid.base.toString()),
    quoteAmount: BigInt(log.account.liquid.quote.toString()),
    asset: log.asset.bits,
    txId: receipt.txId,
    timestamp: tai64ToDate(receipt.time).toISOString()
  })
  withdrawToMarketEvents.set(event.id, event)

  // Retrieve the user's balance
  const balance = await lookupBalance(ctx.store, balances, getHash(`${getIdentity(log.user)}-${receipt.id}`))

  // If a balance exists, update it with the new base and quote amounts
  updateUserBalance("WITHDRAW_TO", BigInt(log.account.liquid.base.toString()), BigInt(log.account.liquid.quote.toString()), tai64ToDate(receipt.time).toISOString(), balance ?? null, log, receipt, balances, ctx);
}