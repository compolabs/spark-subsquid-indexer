import { nanoid } from 'nanoid';
import type { DepositEventOutput } from './abi/Market';
import { DepositEvent, Balance } from './model';
import tai64ToDate, { getHash, getIdentity, lookupBalance } from './utils';

export async function handleDepositEvent(log: DepositEventOutput, receipt: any, depositEvents: Map<string, DepositEvent>, balances: Map<string, Balance>, ctx: any) {

  // Construct the DepositEvent and save in context for tracking
  const event = new DepositEvent({
    id: getHash(`${receipt.txId}-${nanoid()}`),
    market: receipt.id,
    user: getIdentity(log.user),
    amount: BigInt(log.amount.toString()),
    baseAmount: BigInt(log.account.liquid.base.toString()),
    quoteAmount: BigInt(log.account.liquid.quote.toString()),
    asset: log.asset.bits,
    txId: receipt.txId,
    timestamp: tai64ToDate(receipt.time).toISOString(),
  })
  depositEvents.set(event.id, event)

  // Retrieve the user's balance
  const balanceId = getHash(`${getIdentity(log.user)}-${receipt.id}`);
  let balance = await lookupBalance(ctx.store, balances, balanceId)

  // If balance exists, update it with the new base and quote amounts
  if (balance) {
    balance.baseAmount = BigInt(log.account.liquid.base.toString());
    balance.quoteAmount = BigInt(log.account.liquid.quote.toString());
    balance.timestamp = tai64ToDate(receipt.time).toISOString();
  } else {
    // If no balance exists, create a new balance record
    balance = new Balance({
      ...event,
      id: balanceId,
    });
  }
  balances.set(balance.id, balance);
}
