import crypto from "crypto";
import BN from "./BN";
import { Store } from "@subsquid/typeorm-store";
import { ActiveBuyOrder, ActiveSellOrder, Balance, Order } from "./model";
import { IdentityOutput } from "./abi/OrderbookAbi";
import { assertNotNull } from '@subsquid/util-internal'

export const getHash = (data: string) => {
 return crypto.createHash("sha256").update(data).digest("hex");
};

export default function tai64ToDate(num: bigint) {
 const dateStr = new BN((num - BigInt(Math.pow(2, 62)) - BigInt(10)).toString()).times(1000).toString();
 return new Date(+dateStr);
}

export async function lookupOrder(store: Store, orders: Map<string, Order>, id: string) {
 let order = orders.get(id)
 if (!order) {
  order = await store.get(Order, id)
  if (order) {
   orders.set(id, order)
  }
 }
 return order
}


export async function lookupBuyOrder(store: Store, orders: Map<string, ActiveBuyOrder>, id: string) {
 let order = orders.get(id)
 if (!order) {
  order = await store.get(ActiveBuyOrder, id)
  if (order) {
   orders.set(id, order)
  }
 }
 return order
}


export async function lookupSellOrder(store: Store, orders: Map<string, ActiveBuyOrder>, id: string) {
 let order = orders.get(id)
 if (!order) {
  order = await store.get(ActiveSellOrder, id)
  if (order) {
   orders.set(id, order)
  }
 }
 return order
}


export function getIdentity(output: IdentityOutput): string {
 return assertNotNull(output.Address?.bits || output.ContractId?.bits)
}

export async function lookupBalance(store: Store, balances: Map<string, Balance>, id: string) {
 let balance = balances.get(id)
 if (!balance) {
  balance = await store.get(Balance, id)
  if (balance) {
   balances.set(id, balance)
  }
 }
 return balance
}
