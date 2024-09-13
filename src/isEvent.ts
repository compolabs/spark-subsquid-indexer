import { Contract, JsonAbi } from "fuels";

const isEvent = <T>(eventName: string, object: any, abi: JsonAbi): object is T =>
  checkFieldsInObject(object, getEventFields(eventName, abi)!);
export default isEvent;

export function getEventFields(
  eventName: string,
  jsonAbi: JsonAbi
): string[] | undefined {
  const jsonAbiEventTypes = jsonAbi.metadataTypes.find(
    (metadataType) => metadataType.type === `struct ${eventName}`
  );
  return jsonAbiEventTypes?.components?.map(({ name }) => name);
}

export function checkFieldsInObject(obj: any, fields: string[]): boolean {
  return typeof obj === "object" && fields.every((field) => field in obj);
}
