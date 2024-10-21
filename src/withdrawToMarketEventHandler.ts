import { nanoid } from 'nanoid';
import type { WithdrawToMarketEventOutput } from './abi/Market';
import { WithdrawToMarketEvent } from './model';
import tai64ToDate, { getHash, getIdentity, lookupBalance } from './utils';

export async function handleWithdrawToMarketEvent(log: WithdrawToMarketEventOutput, receipt: any, withdrawToMarketEvents: Map<string, any>, balances: Map<string, any>, ctx: any) {

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
  if (balance) {
    balance.baseAmount = BigInt(log.account.liquid.base.toString());
    balance.quoteAmount = BigInt(log.account.liquid.quote.toString());
    balance.timestamp = tai64ToDate(receipt.time).toISOString();
    balances.set(balance.id, balance);
  } else {
    ctx.log.warn(`NO BALANCE WITHDRAW_TO FOR USER: ${getIdentity(log.user)} BALANCE ID: ${getHash(`${getIdentity(log.user)}-${receipt.id}`)} MARKET: ${receipt.id}.`);
  }
}