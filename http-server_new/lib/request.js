export function parseQuery(url) {
  const query = {};
  const queryIndex = url.indexOf("?");

  if (queryIndex === -1) return query;

  const queryString = url.slice(queryIndex + 1);
  const pairs = queryString.split("&");

  for (const pair of pairs) {
    const [key, value] = pair.split("=");
    if (key) {
      query[decodeURIComponent(key)] = value ? decodeURIComponent(value) : "";
    }
  }

  return query;
}

/**
 * Parse request body (JSON)
 * Returns a promise that resolves with parsed body
 */
export function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;

      // Limit body size to prevent memory attacks (10MB default)
      if (data.length > 10 * 1024 * 1024) {
        req.connection.destroy();
        reject(new Error("Request body too large"));
      }
    });

    req.on("end", () => {
      try {
        if (data.length === 0) {
          resolve(null);
        } else if (req.headers["content-type"]?.includes("application/json")) {
          resolve(JSON.parse(data));
        } else {
          resolve(data);
        }
      } catch (error) {
        reject(new Error("Invalid JSON in request body"));
      }
    });

    req.on("error", reject);
  });
}

/**
 * Extract pathname from URL (without query string)
 */
export function getPathname(url) {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}
