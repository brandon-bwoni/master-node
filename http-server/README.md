# Velocity - High-Performance Node.js HTTP Framework

A lightweight, high-performance HTTP framework built from first principles to understand Node.js internals and web framework design.

## 🚀 Features

- **Fast Radix Tree Router** - O(k) route lookup where k = URL length
- **Middleware Pipeline** - Express-like middleware with async/await support
- **Request Context** - Clean context object passed through the pipeline
- **Built-in Parsers** - Query strings, URL parameters, JSON body parsing
- **Response Helpers** - JSON, HTML, text, redirects
- **Error Handling** - Async error handling with custom error handlers
- **Zero Dependencies** - Pure Node.js implementation

## 📦 Installation

This is a learning project. Clone and run:

```bash
node example.js
```

## 🎯 Quick Start

```javascript
import Application from './index.js';

const app = new Application();

// Global middleware
app.use(async (ctx, next) => {
  console.log(`${ctx.method} ${ctx.url}`);
  await next();
});

// Routes
app.get('/', (ctx) => {
  ctx.json({ message: 'Hello, Velocity!' });
});

app.get('/users/:id', (ctx) => {
  ctx.json({ userId: ctx.params.id });
});

app.post('/users', (ctx) => {
  const user = ctx.body;
  ctx.setStatus(201);
  ctx.json({ created: user });
});

// Start server
app.listen(3000);
```

## 📚 Core Concepts

### 1. Request Context

The `Context` object encapsulates all request/response data:

```javascript
{
  req,           // Native request object
  res,           // Native response object
  method,        // HTTP method
  url,           // Full URL
  path,          // Pathname (without query)
  params,        // URL parameters { id: '123' }
  query,         // Query strings { page: '1' }
  body,          // Parsed request body
  headers,       // Request headers
  state,         // Custom state object
  status,        // Response status code
}
```

### 2. Radix Tree Router

Routes are stored in a radix tree (trie) for O(k) lookup performance:

```
/
├── users
│   ├── :id           (dynamic parameter)
│   └── /posts
│       └── :postId
├── search
└── *                 (wildcard)
```

**Route Priority:**
1. Static paths (`/users`)
2. Dynamic parameters (`/users/:id`)
3. Wildcards (`/*`)

### 3. Middleware Pipeline

Middleware functions execute in order with `next()`:

```javascript
app.use(async (ctx, next) => {
  // Before route handler
  const start = Date.now();
  
  await next(); // Execute next middleware/handler
  
  // After route handler
  console.log(`Took ${Date.now() - start}ms`);
});
```

### 4. Response Methods

```javascript
ctx.json({ data: 'value' });           // JSON response
ctx.send('Plain text');                // Text response
ctx.html('<h1>Hello</h1>');           // HTML response
ctx.redirect('/new-url');              // Redirect
ctx.setStatus(201).json({ created }); // Chainable
```

## 🔥 Advanced Features

### Route-Specific Middleware

```javascript
const auth = async (ctx, next) => {
  if (!ctx.headers.authorization) {
    ctx.setStatus(401);
    ctx.json({ error: 'Unauthorized' });
    return;
  }
  await next();
};

app.get('/protected', auth, (ctx) => {
  ctx.json({ secret: 'data' });
});
```

### Error Handling

```javascript
// Throw errors anywhere
app.get('/error', (ctx) => {
  const error = new Error('Not found');
  error.status = 404;
  throw error;
});

// Custom error handler
app.onError((error, ctx) => {
  console.error(error);
  ctx.setStatus(error.status || 500);
  ctx.json({ error: error.message });
});
```

### Async Operations

```javascript
app.get('/users/:id', async (ctx) => {
  const user = await db.findUser(ctx.params.id);
  ctx.json(user);
});
```

## ⚡ Performance Optimizations

1. **Radix Tree Routing** - O(k) instead of O(n) route matching
2. **Single Context Object** - Reduces memory allocations
3. **Minimal Abstractions** - Direct HTTP object access
4. **Zero Dependencies** - No overhead from external packages
5. **Request Isolation** - Each request has independent context

## 🏗️ Architecture

```
├── lib/
│   ├── application.js  - Main app class, middleware system
│   ├── router.js       - Radix tree router implementation
│   ├── context.js      - Request/response context wrapper
│   └── request.js      - Parsing utilities
├── index.js            - Main export
└── example.js          - Comprehensive examples
```

## 🎓 Learning Objectives

This framework teaches:

- ✅ HTTP server fundamentals
- ✅ Request/response lifecycle
- ✅ Routing algorithms (radix trees)
- ✅ Middleware pattern design
- ✅ Async/await error handling
- ✅ Context isolation in concurrent requests
- ✅ Performance optimization techniques
- ✅ Framework architecture design

## 🧪 Testing Routes

```bash
# GET requests
curl http://localhost:3000/
curl http://localhost:3000/users/123
curl http://localhost:3000/search?q=test&page=2

# POST request
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'

# With auth header
curl http://localhost:3000/protected \
  -H "Authorization: Bearer token123"
```

## 📊 Comparison with Express

| Feature | Velocity | Express |
|---------|----------|---------|
| Routing | Radix Tree (O(k)) | Linear (O(n)) |
| Dependencies | 0 | 30+ |
| Size | ~400 LOC | ~5000+ LOC |
| Learning Curve | Simple | Moderate |
| Production Ready | Learning | Yes |

## 🤝 Contributing

This is a learning project. Feel free to:
- Study the code
- Experiment with modifications
- Add features (WebSocket, cookies, sessions)
- Improve performance
- Write tests

## 📝 License

MIT - Built for educational purposes

## 🙏 Acknowledgments

Inspired by:
- Express.js - Middleware pattern
- Koa.js - Context object design
- Fastify - Performance optimizations
- Node.js HTTP module - Core foundation
