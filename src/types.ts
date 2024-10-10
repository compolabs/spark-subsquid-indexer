import assert from "assert";
import type { BN, JsonAbi } from "fuels";
import { Market } from "./abi";

const prefix = "struct events::";

const types = createTypes(Market.abi);

export function getEventType(logId: BN): string {
	const event = types.get(logId.toString());
	assert(event, `unexpected log id - ${logId}`);
	return event;
}

function createTypes(abi: JsonAbi) {
	const concreteTypes = new Map<string, string>();
	for (const type of abi.concreteTypes) {
		concreteTypes.set(type.concreteTypeId, type.type);
	}

	const events = new Map<string, string>();
	for (const type of abi.loggedTypes) {
		const typeName = concreteTypes.get(type.concreteTypeId);
		assert(typeName);

		if (typeName.startsWith(prefix)) {
			const name = normalizeName(typeName);
			events.set(type.logId, name);
		}
	}
	return events;
}

function normalizeName(name: string) {
	return name.slice(prefix.length);
}
