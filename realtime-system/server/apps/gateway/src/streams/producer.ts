import {pub} from "../config/redis.js"

export async function appendToStream(stream: string, payload: any) {
    await pub.xAdd(stream, "*", {
        data: JSON.stringify(payload)
    })
}