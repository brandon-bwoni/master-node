import { fileURLToPath } from "url";
import path from "path";
import fs from "fs"
import { redis } from "../../infra/redisClient.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const script = fs.readFileSync(
    path.join(__dirname, "../scripts/tokenBucket.lua"), 
    "utf-8")

let sha: string | undefined;

export async function loadScript(): Promise<void>{
    sha = await redis.script("LOAD", script) as string
}

// Ensure the scipt is loaded
async function ensureLoaded(): Promise<string> {
    if (!sha) await loadScript();
    return sha!;
}


export async function checkTokenBucket(
  key: string,
  rate: number,
  capacity: number
) {
  const now = Date.now();
  const currentSha = await ensureLoaded()

  const execute = () => redis.evalsha(
    currentSha,
    1,
    key,
    now,
    rate,
    capacity
  ) as Promise <[number, number]>

  let result: [number, number];

  try {
    result = await execute();
  } catch (err: any) {
    if (err.message?.includes("NOSCRIPT")) {
      await loadScript();
      result = await execute();  
    } else {
      throw err;
    }
  }

  const [allowed, tokens] = result;

  return {
    allowed: allowed === 1,
    remaining: Math.floor(tokens),
  };
}   