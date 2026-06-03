import {pub} from "../config/redis.js"

export async function publish(channel: string, payload: any) {
    await pub.publish(channel, JSON.stringify(payload))
}