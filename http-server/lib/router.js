class RouterNode {
  constructor() {
    this.children = new Map(); // Static path segments
    this.handler = null; // Route handler
    this.paramName = null; // Dynamic param name (:id)
    this.paramChild = null; // Dynamic param child node
    this.wildcardHandler = null; // Wildcard handler (*)
    this.methods = new Map(); // HTTP method handlers
  }
}

class Router {
  constructor() {
    this.trees = new Map(); // Separate tree for each HTTP method
    this.middleware = []; // Global middleware
  }

  /**
   * Register a route handler
   */
  addRoute(method, path, handler) {
    // Ensure tree exists for method
    if (!this.trees.has(method)) {
      this.trees.set(method, new RouterNode());
    }

    const root = this.trees.get(method);
    this._insert(root, path, handler);
  }

  /**
   * Insert path into radix tree
   */
  _insert(node, path, handler) {
    // Remove trailing slash for consistency
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
          current.paramChild = new RouterNode();
          current.paramName = paramName;
        }
        current = current.paramChild;
      } else if (segment === "*") {
        // Wildcard - matches everything
        current.wildcardHandler = handler;
        return;
      } else {
        // Static segment
        if (!current.children.has(segment)) {
          current.children.set(segment, new RouterNode());
        }
        current = current.children.get(segment);
      }
    }

    current.handler = handler;
  }

  /**
   * Find route handler for given path
   * Returns { handler, params } or null
   */
  find(method, path) {
    const tree = this.trees.get(method);
    if (!tree) return null;

    // Remove trailing slash
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }

    const segments = path.split("/").filter((s) => s.length > 0);
    return this._search(tree, segments, {});
  }

  /**
   * Search radix tree for matching route
   */
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

    // Try static match first (highest priority)
    if (node.children.has(segment)) {
      const result = this._search(
        node.children.get(segment),
        remaining,
        params,
      );
      if (result) return result;
    }

    // Try parameter match
    if (node.paramChild) {
      const newParams = { ...params, [node.paramName]: segment };
      const result = this._search(node.paramChild, remaining, newParams);
      if (result) return result;
    }

    // Try wildcard match (lowest priority)
    if (node.wildcardHandler) {
      return { handler: node.wildcardHandler, params };
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

export default Router;
