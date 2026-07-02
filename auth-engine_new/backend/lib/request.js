"use strict";

function safeDecode(str) {
  try {
    return decodeURIComponent(str.replace(/\+/g, " "));
  } catch {
    return str;
  }
}

export function parseQuery(url) {
  const query = {};
  const queryIndex = url.indexOf("?");

  if (queryIndex === -1) return query;

  const queryString = url.slice(queryIndex + 1);
  if (queryString.length === 0) return query;

  const pairs = queryString.split("&");

  for (const pair of pairs) {
    if (pair.length === 0) continue;

    const eqIndex = pair.indexOf("=");

    if (eqIndex === -1) {
      const key = safeDecode(pair);
      if (key) query[key] = null;
    } else {
      const key = safeDecode(pair.slice(0, eqIndex));
      const value = safeDecode(pair.slice(eqIndex + 1));
    }
  }
  return query;
}

export function parseBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null) {
      return resolve(req.body);
    }

    const chunks = [];
    let totalLength = 0;
    let rejected = false;

    req.on("data", (chunk) => {
      if (rejected) return;

      if (totalLength + chunk.length > limit) {
        rejected = true;
        req.destroy();
        reject(new Error(`Request body too large (limit: ${limit} bytes)`));
        return;
      }

      chunks.push(chunk);
      totalLength += chunk.length;
    });

    req.on("end", () => {
      if (rejected) return;

      if (totalLength === 0) {
        return resolve(null);
      }

      const raw = Buffer.concat(chunks, totalLength);

      const contentType = (req.headers["content-type"] ?? "")
        .split(";")[0]
        .trim();

      try {
        if (contentType === "application/json") {
          resolve(JSON.parse(raw.toString("utf8")));
        } else if (contentType === "application/x-www-form-urlencoded") {
          resolve(parseQuery("?" + raw.toString("utf8")));
        } else {
          resolve(raw);
        }
      } catch {
        reject(new Error("Invalid JSON in request body"));
      }
    });

    req.on("error", (err) => {
      if (!rejected) reject(err);
    });
  });
}

export function getPathname(url) {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}
