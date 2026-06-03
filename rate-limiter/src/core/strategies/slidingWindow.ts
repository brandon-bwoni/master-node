import { fileURLToPath } from "url";
import path from "path";
import fs from "fs"
import { redis } from "../../infra/redisClient.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const script = fs.readFileSync(
    path.join(__dirname, "../scripts/slidingWindow.lua"), 
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


// Execute lua script
export async function checkSlidingWindow(
    key: string,
    limit: number,
    window: number
){
    const now = Date.now()
    const currentSha = await ensureLoaded()

    const execute = () => redis.evalsha(
        currentSha, 
        1,
        key, 
        now,
        window,
        limit 
    ) as Promise <[number, number]>

    let result: [number, number]

    try{
        result = await execute()
    } catch (err: any){
        if(err.message?.includes("NOSCRIPT")){
            await loadScript()
            result = await execute()
        }
        throw err
    }

const [allowed, count] = result

    return {
        allowed: allowed === 1,
        remaining: Math.max(0, limit - count)
    }
}

// Local validation
for (let i = 0; i < 10; i++) {
  console.log(await checkSlidingWindow("user:1", 5, 10000));
}


