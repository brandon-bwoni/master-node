import { publish } from "../pubsub/publisher.js";
import { joinChannel } from "../registry/channel.registry.js";
import { enqueue } from "../backpressure/queue.js";

export function handleMessage(connectionId: string, raw: string) {
  const message = JSON.parse(raw);

  switch (message.type) {
    case "subscribe":
      joinChannel(connectionId, message.channel);
      break;

    case "publish":
      enqueue(() => publish(message.channel, message.payload));
      break;
  }
}
