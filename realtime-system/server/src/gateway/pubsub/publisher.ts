import { getPublisher } from "../config/redis.js";

export async function publish(channel: string, payload: any) {
  const pub = await getPublisher();
  await pub.publish(channel, JSON.stringify(payload));
}
