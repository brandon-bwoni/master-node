class Context {
  constructor(req, res, app) {
    // Native Node.js objects
    this.req = req;
    this.res = res;
    this.app = app;

    // Request shortcuts
    this.method = req.method;
    this.url = req.url;
    this.path = null;

    // Parsed data (populated by middleware)
    this.params = null;
    this.query = null;
    this.state = null;
    this.responseHeaders = null;

    // Custom state
    this.state = {}; // User-defined data

    // Response state
    this.status = 200;
    this.responseHeaders = {};
  }

  getParams() {
    if (!this.params) this.params = Object.create(null);
    return this.params;
  }

  /**
   * Set response status code
   */
  setStatus(code) {
    this.status = code;
    return this;
  }

  /**
   * Set response header
   */
  setHeader(key, value) {
    this.responseHeaders[key] = value;
    return this;
  }

  /**
   * Send JSON response
   */
  json(data) {
    this.setHeader("Content-Type", "application/json");
    this.res.writeHead(this.status, this.responseHeaders);
    this.res.end(JSON.stringify(data));
  }

  /**
   * Send text response
   */
  send(data) {
    this.setHeader("Content-Type", "text/plain");
    this.res.writeHead(this.status, this.responseHeaders);
    this.res.end(String(data));
  }

  /**
   * Send HTML response
   */
  html(data) {
    this.setHeader("Content-Type", "text/html");
    this.res.writeHead(this.status, this.responseHeaders);
    this.res.end(data);
  }

  /**
   * Redirect to URL
   */
  redirect(url, statusCode = 302) {
    this.status = statusCode;
    this.setHeader("Location", url);
    this.res.statusCode = this.status;
    for (const k in headers) {
      this.res.setHeader(k, headers[k]);
    }
    this.res.end();
  }
}

export default Context;
