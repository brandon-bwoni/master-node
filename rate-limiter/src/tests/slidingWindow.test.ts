import { checkSlidingWindow } from "../core/strategies/slidingWindow.js";

// Simulating parallel requests
const promises = Array.from({ length: 1000 }).map(() =>
  checkSlidingWindow("user:concurrent", 100, 10000)
);

const results = await Promise.all(promises);

const allowed = results.filter(r => r.allowed).length;

console.log({ allowed });