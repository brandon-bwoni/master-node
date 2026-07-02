# Gateway Server

Node.js/TypeScript WebSocket gateway for the realtime-system distributed chat application.

## Overview

This is the main server component implementing:

- Multi-worker WebSocket gateway (Fastify + `@fastify/websocket`)
- Redis-backed pub/sub for message distribution
- Presence tracking & online status
- Message history replay via Redis Streams
- HTTP load-balancing proxy with consistent hashing

## Quick Start

### Prerequisites

- Node.js 18+
- Redis 6.0+ running locally or accessible
- pnpm (or npm)

### Install & Run

```bash
pnpm install

# Development (runs proxy + gateway with hot-reload)
pnpm run dev

# Production build
npm run build

# Run specific component
pnpm run dev:gateway    # Only gateway
pnpm run dev:proxy      # Only proxy
```

**Expected Output:**

```
[Proxy] Proxy server started { port: 3000, pid: 12345 }
[Gateway 1] Primary started { workerCount: 4, pid: 12346 }
[Gateway 1] Worker forked { pid: 12347, workerId: 1 }
[Gateway 1] Worker started { port: 3001, nodeId: worker-0 }
[Gateway 2] Worker forked { pid: 12348, workerId: 2 }
...
```

## Configuration

### Environment Variables

Create `.env` in this directory:

```bash
# Redis
REDIS_URL=redis://localhost:6379

# Server
PORT=3001                           # Gateway port
HOST=127.0.0.1                      # Bind address
NODE_ID=worker-0                    # Set automatically
CLUSTER_WORKERS=4                   # Number of worker processes

# Auth
JWT_SECRET=your-secret-key          # REQUIRED for production

# Logging
LOG_LEVEL=info                       # debug|info|warn|error|fatal

# Proxy (set via PROXY_PORT env var or hardcoded in proxy/index.ts)
# PROXY_PORT=3000
```

## Architecture

### Proxy (`src/proxy/`)

- HTTP proxy with consistent-hash load balancing
- Routes WebSocket connections to gateway nodes
- Health checks upstream services

### Gateway (`src/gateway/`)

- Fastify WebSocket server with multiple workers
- Handles client connections
- Manages message routing, presence, replay

#### Key Modules

| Module          | Purpose                                          |
| --------------- | ------------------------------------------------ |
| `ws/`           | WebSocket connection lifecycle & message routing |
| `pubsub/`       | Redis pub/sub for message broadcasting           |
| `registry/`     | In-memory connection & channel tracking          |
| `presence/`     | User online status management                    |
| `messaging/`    | Message publishing & history                     |
| `streams/`      | Redis Stream operations for replay               |
| `middleware/`   | JWT authentication                               |
| `backpressure/` | Message queue to prevent overload                |

## API

### WebSocket (`ws://localhost:3000/ws?token=JWT`)

#### Client → Server

**Subscribe to room:**

```json
{
  "type": "subscribe",
  "channel": "general"
}
```

**Send message:**

```json
{
  "type": "publish",
  "channel": "general",
  "payload": {
    "type": "chat",
    "roomId": "general",
    "userId": "user123",
    "text": "Hello world",
    "ts": 1234567890000
  }
}
```

#### Server → Client

**Message broadcast:**

```json
{
  "type": "chat",
  "roomId": "general",
  "userId": "user123",
  "text": "Hello world",
  "ts": 1234567890000,
  "streamId": "1234567890000-0"
}
```

**Presence update:**

```json
{
  "type": "presence",
  "roomId": "general",
  "userId": "user123",
  "username": "user1",
  "event": "join",
  "ts": 1234567890000
}
```

### HTTP Endpoints

| Endpoint        | Purpose              |
| --------------- | -------------------- |
| `GET /health`   | Gateway health check |
| `GET /` (proxy) | Proxy health check   |

## Data Structures (Redis)

### Pub/Sub Channels

```
room:general          # Messages for "general" room
room:random           # Messages for "random" room
```

### Streams (Message History)

```
stream:general        # All messages in "general" room
stream:random         # All messages in "random" room
```

### Presence Keys

```
user:presence:user123       # User's presence record (hash)
room:presence:general       # Room member IDs (set)
```

### Connection Registry (In-Memory)

```
ConnectionRecord {
  connectionId: string
  userId: string
  username: string
  socket: WebSocket
  rooms: Set<string>
}
```

## Development

### Project Structure

```
src/
├── gateway/                          # Main gateway server
│   ├── index.ts                      # Cluster bootstrap
│   ├── server.ts                     # Fastify app setup
│   ├── ws/                           # WebSocket logic
│   ├── pubsub/                       # Pub/Sub operations
│   ├── registry/                     # Connection tracking
│   ├── presence/                     # Presence management
│   ├── messaging/                    # Message operations
│   ├── streams/                      # Stream operations
│   ├── middleware/                   # Auth plugins
│   ├── backpressure/                 # Queue management
│   ├── config/                       # Environment & Redis setup
│   └── utils/                        # Constants & helpers
├── proxy/                            # HTTP proxy server
│   ├── index.ts                      # Entry point
│   ├── proxy.ts                      # http-proxy setup
│   ├── router.ts                     # Routing logic
│   └── upstream.ts                   # Health checks
├── shared/
│   └── logger.ts                     # Pino logger
└── types/
    ├── message.ts                    # Message types
    └── user.ts                       # User & presence types
```

### Key Patterns

#### Adding a Message Type

1. Add type to `types/message.ts`
2. Add handler in `gateway/ws/handler.ts` (switch case)
3. Update client to send/receive new type

#### Scaling to Multiple Gateways

- Deploy multiple gateway instances to different ports
- Proxy routes connections via consistent hash
- All share same Redis (single source of truth)

#### Debugging

- Set `LOG_LEVEL=debug` in `.env`
- Use `redis-cli MONITOR` to see Redis traffic
- Use `curl http://localhost:3001/health` to check gateway health

## Monitoring

### Logs

- Gateway logs go to stdout (via Pino)
- Each message includes request ID for tracing
- Search for worker crashes: `grep "Worker died"`

### Redis CLI

```bash
redis-cli
> DBSIZE                    # Total keys
> INFO stats                # Stats
> XLEN stream:general       # Message count
> SMEMBERS room:presence:general  # Online members
```

### Production Checklist

- [ ] `JWT_SECRET` set to strong value
- [ ] Redis persistence enabled (AOF or RDB)
- [ ] Redis replicated/clustered for HA
- [ ] Gateway deployed behind load balancer
- [ ] Monitoring/alerting set up
- [ ] Error tracking (Sentry, etc)
- [ ] Rate limiting enabled
- [ ] Log aggregation configured

## Troubleshooting

| Issue                    | Solution                                                 |
| ------------------------ | -------------------------------------------------------- |
| "Redis ping failed"      | Check Redis is running: `redis-cli ping`                 |
| "Worker crash loop"      | Check logs for error, fix code, restart                  |
| "Connection refused"     | Check proxy port 3000, gateway port 3001                 |
| "JWT invalid"            | Check `JWT_SECRET` matches between proxy & gateway       |
| "Messages not appearing" | Check Redis channels: `redis-cli SUBSCRIBE room:general` |

## Next Steps

1. Add server-side authentication endpoint (`POST /api/auth/login`)
2. Implement rooms API (`GET /api/rooms`)
3. Add unit tests (Jest)
4. Set up Docker + Compose
5. Add OpenTelemetry observability

See [PROJECT_DOCUMENTATION.md](../PROJECT_DOCUMENTATION.md) for full roadmap.
