class Context {
  constructor(req, res, app) {
    this.req = req;
    this.res = res;
    this.app = app;

    this.method = req.method;
    this.url = req.url;
    this.path = null;

    this.params = null;
    this.query = null;
    this.state = null;
    this.responseHeaders = null;

    this.state = {}; // User-defined data

    // Response state
    this.status = 200;
    this.responseHeaders = {};
  }

  getParams() {
    if (!this.params) this.params = Object.create(null);
    return this.params;
  }

  setStatus(code) {
    this.status = code;
  }

  setHeader(key, value) {
    this.responseHeaders[key] = value;
    return this;
  }

  json(data) {
    this.setHeader("Content-Type", "application/json");
    this.res.writeHead(this.status, this.responseHeaders);
    this.res.end(JSON.stringify(data));
  }

  send(data) {
    this.setHeader("Content-Type", "text/plain");
    this.res.writeHead(this.status, this.responseHeaders);
    this.res.end(String(data));
  }

  html(data) {
    this.setHeader("Content-Type", "text/html");
    this.res.writeHead(this.status, this.responseHeaders);
    this.res.end(data);
  }
}

export default Context;
