import http from "http";

import { Context } from "./context.js";

const context = new Context();

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });

  res.end("Hello world\n");
});

server.on("request", (req, res) => {
  context.req = req;
  context.res = res;
});

server.listen(3000, () => {
  console.log(`Server listening on port 3000`);
});
