export class Context {
  constructor(req, res) {
    this.req = req;
    this.res = res;
    this.method = req.method;
    this.url = req.url;
    this.params = null;
    this.query = null;
    this.body = null;
  }
}
