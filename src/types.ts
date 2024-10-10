import { JsonAbi, BN } from 'fuels'
import { Market } from './abi'
import assert from 'assert'

const prefix = 'struct events::'

const types = createTypes(Market.abi)

export function getEventType(logId: BN): string {
 let event = types.get(logId.toString())
 assert(event, `unexpected log id - ${logId}`)
 return event
}

function createTypes(abi: JsonAbi) {
 let concreteTypes = new Map<string, string>()
 for (let type of abi.concreteTypes) {
  concreteTypes.set(type.concreteTypeId, type.type)
 }

 let events = new Map<string, string>()
 for (let type of abi.loggedTypes) {
  let typeName = concreteTypes.get(type.concreteTypeId)
  assert(typeName)

  if (typeName.startsWith(prefix)) {
   let name = normalizeName(typeName)
   events.set(type.logId, name)
  }
 }
 return events
}

function normalizeName(name: string) {
 return name.slice(prefix.length)
}