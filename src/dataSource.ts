import { DataSourceBuilder } from "@subsquid/fuel-stream";
import { MARKETS } from "./marketConfig";
import { augmentBlock } from "@subsquid/fuel-objects";
import { BN, getDecodedLogs, ReceiptLogData, ReceiptType } from "fuels";
import { assertNotNull } from '@subsquid/util-internal'
import { Market } from './abi'

// First we create a DataSource - component,
// that defines where to get the data and what data should we get.
export const dataSource = new DataSourceBuilder()
 // Provide Subsquid Network Gateway URL.
 .setGateway('https://v2.archive.subsquid.io/network/fuel-testnet')
 // Subsquid Network is always about 10000 blocks behind the head.
 // We must use regular GraphQL endpoint to get through the last mile
 // and stay on top of the chain.
 // This is a limitation, and we promise to lift it in the future!
 .setGraphql({
  url: 'https://testnet.fuel.network/v1/graphql',
  strideConcurrency: 3,
  strideSize: 50,
 })
 .setFields({
  receipt: {
   contract: true,
   contractId: true,
   receiptType: true,
   data: true,
   is: true,
   len: true,
   pc: true,
   ptr: true,
   ra: true,
   rb: true,
   digest: true,
  },
  transaction: {
   hash: true,
   status: true
  }
 })
 .setBlockRange({
  from: 6142500,
 })
 .addReceipt({
  type: ['LOG_DATA'],
  transaction: true,
  contract: MARKETS,
 })
 .build()

export async function processBlocks(ctx: any) {
 // Block items that we get from `ctx.blocks` are flat JS objects.
 //
 // We can use `augmentBlock()` function from `@subsquid/fuel-objects`
 // to enrich block items with references to related objects.
 let blocks = ctx.blocks.map(augmentBlock);

 let balances: Map<string, any> = new Map();
 let orders: Map<string, any> = new Map();
 let activeBuyOrders: Map<string, any> = new Map();
 let activeSellOrders: Map<string, any> = new Map();
 let tradeOrderEvents: Map<string, any> = new Map();
 let openOrderEvents: Map<string, any> = new Map();
 let cancelOrderEvents: Map<string, any> = new Map();
 let depositEvents: Map<string, any> = new Map();
 let withdrawEvents: Map<string, any> = new Map();

 const receipts: (ReceiptLogData & { data: string, time: bigint, txId: string, receiptId: string })[] = [];
 for (let block of blocks) {
  for (let receipt of block.receipts) {
   let tx = assertNotNull(receipt.transaction);
   if (MARKETS.includes(receipt.contract) && tx.status.type == 'SuccessStatus') {
    receipts.push({
     type: ReceiptType.LogData,
     digest: assertNotNull(receipt.digest),
     id: receipt.contract,
     is: new BN(receipt.is?.toString()),
     len: new BN(receipt.len?.toString()),
     pc: new BN(receipt.pc?.toString()),
     ptr: new BN(receipt.ptr?.toString()),
     val0: new BN(receipt.ra?.toString()),
     val1: new BN(receipt.rb?.toString()),
     data: assertNotNull(receipt.data),
     time: tx.status.time,
     txId: tx.hash,
     receiptId: receipt.id,
    });
   }
  }
 }

 let logs: any[] = getDecodedLogs(receipts, Market.abi);
 return { receipts, logs, balances, orders, activeBuyOrders, activeSellOrders, tradeOrderEvents, openOrderEvents, cancelOrderEvents, depositEvents, withdrawEvents };
}