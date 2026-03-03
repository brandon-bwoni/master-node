class RouteNode {
  constructor() {
    this.children = new Map();
    this.handler = null;
    this.paramName = null;
    this.paramChild = null;
    this.wildcardHandler = null;
  }
}

class RouterTree {
  constructor() {
    this.trees = new Map();
  }

  // Register a route handler
  addRoute(method, path, handler) {
    const m = method.toUpperCase();
    if (!this.trees.has(m)) this.trees.set(m, new RouteNode());
    this._insert(this.trees.get(m), path, handler);
  }

  // Insert path into radix tree
  _insert(node, path, handler) {
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }

    const segments = path.split("/").filter((s) => s.length > 0);
    let current = node;

    for (const segment of segments) {
      if (segment.startsWith(":")) {
        // Dynamic parameter
        const paramName = segment.slice(1);

        if (!current.paramChild) {
          const child = new RouteNode();
          child.paramName = paramName;
          current.paramChild = child;
        } else if (current.paramChild.paramName !== paramName) {
          throw new Error(
            `Conflicting parameter name: ${paramName} vs ${current.paramChild.paramName}`,
          );
        }
        current = current.paramChild;
      } else if (segment === "*") {
        // Wildcard - matches any remaining path
        current.wildcardHandler = handler;
        return;
      } else {
        // Static segment
        if (!current.children.has(segment)) {
          current.children.set(segment, new RouteNode());
        }
        current = current.children.get(segment);
      }
    }

    current.handler = handler;
  }

  // Find a route handler for the given method and path
  find(method, path) {
    const root = this.trees.get(method);
    if (!root) return null;

    // Remove trailing slash
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }

    const segments = path.split("/").filter((s) => s.length > 0);
    return this._search(root, segments, {});
  }

  // Search the radix tree for a matching route
  _search(node, segments, params) {
    if (segments.length === 0) {
      if (node.handler) {
        return { handler: node.handler, params };
      }
      if (node.wildcardHandler) {
        return { handler: node.wildcardHandler, params };
      }
      return null;
    }
    const [segment, ...remaining] = segments;

    //   Try static match first
    if (node.children.has(segment)) {
      const result = this._search(
        node.children.get(segment),
        segments,
        idx + 1,
        params,
      );
      if (result) return result;
    }

    // Try parameter match
    if (node.paramChild) {
      const { paramName } = node.paramChild;
      const prev = params[paramName];
      params[paramName] = segment;

      const result = this._search(node.paramChild, segments, idx + 1, params);
      if (result) return result;

      //  Rollback
      if (prev === undefined) delete params[paramName];
      else params[paramName] = prev;
    }

    // Try wildcard match
    if (node.wildcardHandler) {
      params["*"] = segments.slice(idx).join("/");
      return node.wildcardHandler;
    }

    return null;
  }

  /**
   * HTTP method helpers
   */
  get(path, handler) {
    this.addRoute("GET", path, handler);
  }

  post(path, handler) {
    this.addRoute("POST", path, handler);
  }

  put(path, handler) {
    this.addRoute("PUT", path, handler);
  }

  delete(path, handler) {
    this.addRoute("DELETE", path, handler);
  }

  patch(path, handler) {
    this.addRoute("PATCH", path, handler);
  }

  all(path, handler) {
    const methods = [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "PATCH",
      "HEAD",
      "OPTIONS",
    ];
    methods.forEach((method) => this.addRoute(method, path, handler));
  }
}

export default RouterTree;
