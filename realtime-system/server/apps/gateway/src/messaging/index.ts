import { publish } from "../pubsub/publisher.js";
import { appendToStream } from "../streams/producer.js";

export async function sendMessage(channel: string, payload: any) {
    await publish(channel, payload)
    await appendToStream(channel, payload)
}