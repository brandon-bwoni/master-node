import { sub } from "../config/redis.js";

export async function consumeStreams(stream: string) {
  while (true) {
    const res = await sub.xRead([{ key: stream, id: "$" }], {
      BLOCK: 0,
    });

    if (res) {
      console.log(res);
    }
  }
}
