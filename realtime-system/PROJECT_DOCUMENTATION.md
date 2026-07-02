# Realtime-System: Complete Project Documentation

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Current State](#current-state)
4. [Codebase Structure](#codebase-structure)
5. [Key Features](#key-features)
6. [Technology Stack](#technology-stack)
7. [Setup & Running](#setup--running)
8. [Implementation Details](#implementation-details)
9. [Known Issues & Limitations](#known-issues--limitations)
10. [What's Left to Do](#whats-left-to-do)

---

## Project Overview

**Realtime-System** is a distributed, multi-client chat application built with Node.js and React. It demonstrates enterprise-grade real-time communication patterns using:

- **WebSocket** for bidirectional client-server communication
- **Redis Pub/Sub** for message broadcasting across multiple gateway workers
- **Redis Streams** for message history/replay functionality
- **Redis presence tracking** for online status monitoring
- **Clustering** with automatic worker restart on crashes
- **Load balancing** via HTTP proxy with consistent hashing

**Purpose**: Learning project showcasing scalable real-time communication architecture suitable for production chat systems, collaborative tools, or live notifications.

---

## Architecture

### High-Level Flow Diagram

```
┌─────────────┐         ┌─────────────┐
│   Browser A │         │   Browser B │
│  (Client)   │         │  (Client)   │
└──────┬──────┘         └──────┬──────┘
       │                       │
       │ ws://localhost:3000/ws│
       │ (with JWT token)      │
       │                       │
       └───────────┬───────────┘
                   │
        ┌──────────▼──────────┐
        │  HTTP Proxy :3000   │
        │  (node-http-proxy)  │
        │  Consistent hash on  │
        │  userId             │
        └──────────┬──────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
   ┌─────▼───────┐     ┌────▼──────┐
   │  Gateway 1  │     │ Gateway 2  │
   │  :3001 (PID)│     │ :3001 (PID)│
   │  [Worker 0] │     │ [Worker 1] │
   └──────┬──────┘     └────┬───────┘
          │                 │
          └────────┬────────┘
                   │
         ┌─────────▼─────────┐
         │      REDIS        │
         │                   │
         │ • Pub/Sub (msgs)  │
         │ • Streams (replay)│
         │ • Presence (TTL)  │
         │ • Sets (members)  │
         └───────────────────┘
```

### Key Components

1. **HTTP Proxy** (`src/proxy/`)
   - Routes WebSocket connections to gateway nodes
   - Implements consistent hashing for connection affinity
   - Health checks upstream gateways

2. **Gateway Cluster** (`src/gateway/`)
   - Multiple Node.js workers (default: CPU count)
   - Each handles a subset of client connections
   - Automatic restart on crashes (max 5 restarts/min)

3. **Redis** (External)
   - Central hub for message distribution
   - Persists message history in streams
   - Tracks user presence with TTL

4. **React Client** (`client/`)
   - Vite-based SPA with React 19
   - Uses custom hooks for WebSocket management
   - Redux-like context API for state

---

## Current State

### ✅ Completed Features

#### Backend (Gateway)

- ✅ **Core WebSocket server** (`gateway/server.ts`)
  - Fastify + `@fastify/websocket`
  - JWT token-based authentication
  - Connection lifecycle management (open/close/error)

- ✅ **Clustering & resilience** (`gateway/index.ts`)
  - Multi-worker cluster with PM2-like restart logic
  - Crash detection with exponential backoff
  - Graceful shutdown handling

- ✅ **Message routing** (`gateway/ws/router.ts`, `gateway/ws/handler.ts`)
  - Subscribe/publish WebSocket message handler
  - Channel-based message distribution
  - Backpressure queue for message processing

- ✅ **Pub/Sub system** (`gateway/pubsub/`)
  - Message publishing to Redis Pub/Sub
  - Message streaming to Redis Streams
  - Connection registry for local fan-out

- ✅ **Presence tracking** (`gateway/presence/presence.service.ts`)
  - Online/away/offline status management
  - Room-based member tracking
  - TTL-based auto-cleanup (default: 60s)
  - Presence refresh on activity

- ✅ **Message replay** (`gateway/messaging/replay.ts`)
  - Stream-based message history via `xRange`
  - Chunked loading with hasMore indicator
  - Configurable limit (default: 50, max: 1000)

- ✅ **Connection registry** (`gateway/registry/`)
  - In-memory connection tracking (local worker only)
  - Room membership tracking
  - Efficient channel subscription/unsubscription

- ✅ **HTTP proxy** (`proxy/`)
  - Consistent-hash load balancing
  - Connection health checks
  - Upstream gateway selection

- ✅ **Heartbeat/Keep-alive** (`gateway/ws/heartbeat.ts`)
  - Ping/pong mechanism (25s interval, 10s timeout)
  - Automatic dead connection cleanup

- ✅ **Logging** (`shared/logger.ts`)
  - Structured logging with Pino
  - Request ID tracking
  - Log levels (debug, info, warn, error, fatal)

#### Frontend (React Client)

- ✅ **WebSocket hook** (`hooks/useWebSocket.ts`)
  - Connection management with automatic reconnection
  - Exponential backoff retry logic
  - Ping/pong heartbeat
  - Message queuing during disconnects

- ✅ **Chat context** (`context/`)
  - Centralized state management
  - Reducer pattern for predictable updates
  - Auth state persistence (sessionStorage)

- ✅ **UI Components**
  - `LoginPage.tsx` - Username + room selection
  - `ChatPage.tsx` - Main chat interface
  - `MessageList.tsx` - Message rendering with pending/failed states
  - `MessageInput.tsx` - Auto-expanding textarea + send button
  - `MessageBubble.tsx` - Individual message display
  - `Sidebar.tsx` - Room list + user info + connection status

- ✅ **Authentication**
  - Client-side JWT minting (or server-side via `/api/auth/login` if available)
  - Token passed as URL query parameter
  - sessionStorage persistence

- ✅ **Message types**
  - Chat messages
  - Presence messages (join/leave)
  - Ack/error messages
  - Replay chunks
  - Ping/pong keep-alives

---

## Codebase Structure

### Server (`server/`)

```
server/
├── src/
│   ├── gateway/                    # Main WebSocket gateway
│   │   ├── index.ts                # Cluster setup with worker restart logic
│   │   ├── server.ts               # Fastify app initialization
│   │   ├── ws/
│   │   │   ├── router.ts           # WebSocket route registration
│   │   │   ├── handler.ts          # Message dispatch logic
│   │   │   ├── connection.ts       # Connection lifecycle
│   │   │   ├── lifecycle.ts        # Graceful shutdown
│   │   │   └── heartbeat.ts        # Ping/pong timer
│   │   ├── config/
│   │   │   ├── env.ts              # Environment variable schema
│   │   │   └── redis.ts            # Redis client factory
│   │   ├── pubsub/
│   │   │   ├── publisher.ts        # Publish to Redis
│   │   │   └── subscriber.ts       # Subscribe to Redis messages
│   │   ├── registry/
│   │   │   ├── connection.registry.ts   # Track local connections
│   │   │   └── channel.registry.ts      # Track subscriptions & fan-out
│   │   ├── presence/
│   │   │   └── presence.service.ts      # Presence read/write ops
│   │   ├── messaging/
│   │   │   ├── index.ts            # Send message + append to stream
│   │   │   └── replay.ts           # Message history retrieval
│   │   ├── streams/
│   │   │   ├── producer.ts         # Append to Redis Stream
│   │   │   └── consumer.ts         # (Partial) consume messages
│   │   ├── middleware/
│   │   │   └── auth.ts             # JWT validation plugin
│   │   ├── backpressure/
│   │   │   └── queue.ts            # Message processing queue
│   │   └── utils/
│   │       └── constants.ts        # Redis key patterns, TTLs
│   ├── proxy/                      # HTTP proxy server
│   │   ├── index.ts                # Entry point
│   │   ├── proxy.ts                # http-proxy setup
│   │   ├── router.ts               # Route selection logic
│   │   └── upstream.ts             # Health checks & discovery
│   ├── shared/
│   │   └── logger.ts               # Pino logger instance
│   └── types/
│       ├── message.ts              # Message type definitions
│       └── user.ts                 # User & presence types
├── package.json
├── tsconfig.json
└── README.md (currently empty)
```

### Client (`client/`)

```
client/
├── src/
│   ├── pages/
│   │   ├── LoginPage.tsx           # Username + room selection
│   │   └── ChatPage.tsx            # Main chat UI
│   ├── components/
│   │   ├── Sidebar.tsx             # Room list + status
│   │   ├── MessageList.tsx         # Messages container
│   │   ├── MessageBubble.tsx       # Single message
│   │   └── MessageInput.tsx        # Message composer
│   ├── context/
│   │   ├── ChatContextProvider.tsx # Context wrapper
│   │   ├── chatContext.ts          # Context creation
│   │   ├── chatReducer.ts          # State reducer
│   │   └── useChat.ts              # Custom hook
│   ├── hooks/
│   │   └── useWebSocket.ts         # WebSocket connection manager
│   ├── types/
│   │   └── index.ts                # TypeScript interfaces
│   ├── utils/
│   │   └── index.ts                # Helper functions (ExponentialBackoff, etc)
│   ├── App.tsx                     # Auth routing + app wrapper
│   ├── main.tsx                    # React DOM render
│   ├── App.css                     # Global styles
│   └── index.css                   # Base styles
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

---

## Key Features

### 1. **Distributed Message Broadcasting**

- Messages published to Redis Pub/Sub
- Automatically fanned out to all connected clients in a room
- Works across multiple gateway workers

### 2. **Message History & Replay**

- Messages persisted in Redis Streams
- Clients can request message chunks with `fromId`
- Chunked loading prevents memory overload
- Automatic cleanup via TTL

### 3. **Presence Tracking**

- Real-time online/away/offline status
- Automatic TTL-based cleanup (no explicit logout needed)
- Room-specific member lists
- Per-user presence updates

### 4. **Resilience & High Availability**

- Worker crashes auto-restart (up to 5 times per minute)
- Graceful shutdown with in-flight message draining
- Keep-alive ping/pong with timeout detection
- Connection affinity via consistent hashing

### 5. **Horizontal Scalability**

- Multi-worker cluster per gateway
- Multiple gateways via load balancer
- Stateless gateway design (state in Redis)
- No session affinity required after initial connection

### 6. **Backpressure Handling**

- Queue-based message processing
- Prevents overwhelming slow clients
- Controlled message throughput

---

## Technology Stack

### Backend

- **Runtime**: Node.js (TypeScript)
- **Framework**: Fastify 5.8.5
- **WebSocket**: `@fastify/websocket`, `ws` library
- **Authentication**: `@fastify/jwt`
- **Database/Cache**: Redis 5.12.1
- **Cluster**: Node.js native `cluster` module
- **Proxy**: `http-proxy` 1.18.1
- **Logging**: Pino 10.3.1
- **Environment**: dotenv 17.4.2
- **TypeScript**: 6.0.3

### Frontend

- **Framework**: React 19.2.5
- **Build**: Vite 8.0.9
- **Language**: TypeScript 6.0.2
- **State**: React Context API
- **Linting**: ESLint 9.39.4

### Infrastructure

- **Message Queue**: Redis (Pub/Sub + Streams)
- **Networking**: WebSocket, HTTP

---

## Setup & Running

### Prerequisites

- Node.js 18+ with npm/pnpm
- Redis 6.0+ running locally or accessible
- Ports: 3000 (proxy), 3001 (gateway), 5173 (dev client)

### Installation

#### Server

```bash
cd server
pnpm install
```

#### Client

```bash
cd client
pnpm install
```

### Configuration

#### Server Environment Variables

Create `.env` in `server/` (or rely on defaults):

```bash
# Redis connection
REDIS_URL=redis://localhost:6379

# JWT signing secret (REQUIRED for production)
JWT_SECRET=your-super-secret-key-here

# Gateway port
PORT=3001

# Host binding
HOST=127.0.0.1

# Logging level
LOG_LEVEL=info

# Cluster worker count (default: CPU count)
CLUSTER_WORKERS=4

# Proxy port (set PROXY_PORT env var or use 3000)
PROXY_PORT=3000
```

#### Client Environment Variables

Create `.env` in `client/` (optional):

```bash
# WebSocket proxy endpoint
VITE_PROXY_URL=ws://localhost:3000
```

### Running

#### Start Redis (if not already running)

```bash
redis-server
```

#### Start Server (both proxy and gateway)

```bash
cd server
pnpm run dev
# Runs: concurrently "tsx watch src/proxy/index.ts" "tsx watch src/gateway/index.ts"
```

**Expected Output:**

```
[Proxy] Proxy server started { port: 3000, pid: 12345 }
[Gateway 1] Worker forked { pid: 12346, workerId: 1 }
[Gateway 1] Worker started { port: 3001, ... }
[Gateway 2] Worker forked { pid: 12347, workerId: 2 }
...
```

#### Start Client (separate terminal)

```bash
cd client
pnpm run dev
# Opens http://localhost:5173
```

### Testing (Two-Client Chat)

1. Open http://localhost:5173 in **Browser A**
2. Enter username: `user1`
3. Select room: `general` (or create new)
4. Keep browser open

5. Open http://localhost:5173 in **Browser B** (or new tab)
6. Enter username: `user2`
7. Select same room: `general`

8. Send message from Browser A → appears in Browser B
9. Verify online count updates (should show 2 online)

---

## Implementation Details

### WebSocket Message Flow

#### 1. Client → Server

```typescript
// Subscribe to room
{
  "type": "subscribe",
  "channel": "general"
}

// Send message
{
  "type": "publish",
  "channel": "general",
  "payload": {
    "type": "chat",
    "roomId": "general",
    "userId": "user123",
    "text": "Hello world",
    "ts": 1234567890
  }
}

// Presence update
{
  "type": "presence",
  "event": "join",
  "roomId": "general"
}

// Keep-alive
{
  "type": "ping",
  "ts": 1234567890
}
```

#### 2. Server → Client

```typescript
// Message broadcast
{
  "type": "chat",
  "roomId": "general",
  "userId": "user123",
  "text": "Hello world",
  "ts": 1234567890,
  "streamId": "1234567890-0"
}

// Presence notification
{
  "type": "presence",
  "roomId": "general",
  "userId": "user123",
  "event": "join",
  "ts": 1234567890
}

// Keep-alive response
{
  "type": "pong",
  "ts": 1234567890
}

// Message history chunk
{
  "type": "replay_chunk",
  "roomId": "general",
  "messages": [...],
  "done": false
}

// Error
{
  "type": "error",
  "code": "AUTH_FAILED",
  "message": "Invalid token"
}
```

### Connection Lifecycle

```
1. Client connects to ws://localhost:3000/ws?token=<JWT>
   ↓
2. Proxy routes to Gateway (consistent hash on userId)
   ↓
3. Gateway receives connection on /ws route
   ↓
4. Auth middleware validates JWT
   ↓
5. handleConnection() called
   - Creates ConnectionRecord (stores userId, roomIds, socket)
   - Sends initial presence + room state
   ↓
6. Message loop: client ↔ server
   - Heartbeat (ping/pong every 25s)
   - Subscriptions (client requests room)
   - Publish (client sends message)
   ↓
7. Disconnect
   - Connection removed from registry
   - Presence marked offline
   - Channels unsubscribed
   - Resources cleaned up
```

### Redis Data Structures

#### Pub/Sub Channels

```
redis-cli SUBSCRIBE room:general
redis-cli SUBSCRIBE room:random
```

#### Streams (Message History)

```
redis-cli XLEN stream:general      # Message count
redis-cli XRANGE stream:general 0 -1  # All messages
redis-cli XRANGE stream:general 1234567890-0 +  # From ID onwards
```

#### Presence Keys

```
redis-cli HGETALL user:presence:user123
  userId: "user123"
  username: "user1"
  status: "online"
  roomId: "general"
  lastSeen: "1234567890"

redis-cli SMEMBERS room:presence:general
  -> ["user123", "user456"]  # Member IDs
```

#### Sets

```
redis-cli SMEMBERS room:presence:general  # Room members
```

### Exponential Backoff Reconnection

**Client Retry Logic** (`useWebSocket.ts`):

- 1st attempt: immediate
- 2nd attempt: 1s delay
- 3rd attempt: 2s delay
- 4th attempt: 4s delay
- ... exponential growth, capped at 30s
- Resets on successful connection

### Graceful Shutdown

**Server side**:

1. SIGTERM received
2. Stop accepting new connections
3. Flush pending messages from queue
4. Drain active WebSocket connections
5. Unsubscribe from Redis channels
6. Close Redis connections
7. Exit process

**Worker Restart**:

- Crashes tracked with timestamps
- 5+ crashes in 60s window → don't restart
- Under limit → fork new worker
- Prevents crash-loop death spiral

---

## Known Issues & Limitations

### Current Limitations

1. **No Built-In Rooms List**
   - Client has hardcoded rooms in demo
   - Need backend endpoint: `GET /api/rooms` to fetch available rooms
   - OR: Accept room creation in UI (send to server)

2. **Authentication**
   - JWT secret must match between proxy & gateway
   - Token expiry not enforced (tokens valid indefinitely)
   - No refresh token mechanism
   - Client-side JWT minting insecure for production

3. **Message Ordering**
   - Relies on Redis Pub/Sub delivery order (not guaranteed)
   - Stream IDs ensure ordering when replaying history
   - But live messages from multiple gateways may arrive out-of-order

4. **Presence Edges**
   - TTL-based cleanup means presence data may linger if Redis TTL resets unexpectedly
   - No explicit "go offline" message (relies on timeout)

5. **No Message Ack/Ordering Guarantees**
   - Sent messages not explicitly confirmed by server
   - Client may miss messages during reconnection window

6. **Limited Error Handling**
   - Server errors not always propagated to client
   - No retry mechanism for failed publishes
   - Connection state may desync during network splits

7. **No Scaling to Millions**
   - In-memory connection registry (per worker)
   - Single Redis instance (no clustering)
   - No geographic distribution/edge nodes

8. **No Message Encryption**
   - Messages visible to Redis operators
   - No end-to-end encryption

9. **Testing**
   - No unit tests
   - No integration tests
   - No load testing harness

10. **Styles & UX**
    - UI is minimal/placeholder
    - No dark mode (CSS vars prepared but not wired)
    - No mobile responsive design
    - Missing features like:
      - Typing indicators
      - Read receipts
      - User profiles
      - Message search
      - Pinned messages

---

## What's Left to Do

### 🔴 High Priority

1. **Backend Rooms API**
   - `GET /api/rooms` - List all available rooms
   - `POST /api/rooms` - Create new room
   - `DELETE /api/rooms/{id}` - Archive/delete room
   - Database: Store rooms metadata (not just in memory)

2. **Production Authentication**
   - Server-side login endpoint: `POST /api/auth/login` (username → token)
   - Token expiry + refresh token flow
   - Rate limiting on auth endpoint
   - Password hashing (bcrypt) if user registration added

3. **Message Ack & Deduplication**
   - Add `messageId` to sent messages for ack/retry tracking
   - Server responds with ack/error
   - Client retries on timeout
   - Prevent duplicate messages via idempotency keys

4. **Comprehensive Error Handling**
   - Standardized error responses (code + message)
   - Client-side error boundaries
   - User-facing error notifications
   - Network split recovery

5. **Unit & Integration Tests**
   - Backend: Jest test suite
   - Frontend: Vitest + React Testing Library
   - Coverage: >80% for critical paths
   - CI/CD pipeline (GitHub Actions)

### 🟡 Medium Priority

6. **Message Ordering Guarantees**
   - Implement per-room message sequencing
   - Use Redis INCR for sequence numbers
   - Client validates ordering, requests gaps
   - Fallback to replay on gaps

7. **User Database**
   - Store user profiles (username, avatar, etc)
   - User directory for discovery
   - Relationship/friendship data (optional)

8. **Advanced Presence Features**
   - Typing indicators (broadcast while typing)
   - Read receipts (mark messages as read)
   - User status (available, away, do-not-disturb)
   - Last seen timestamp

9. **Message Features**
   - Edit/delete messages
   - Message reactions/emoji
   - Threaded replies
   - Search messages by text/date
   - Pin important messages

10. **Styling & UX**
    - Professional UI overhaul (Figma → CSS)
    - Dark mode toggle
    - Mobile responsive design
    - Accessibility (WCAG AA)
    - Loading states, animations

11. **Performance Optimization**
    - Message pagination in UI (virtual scrolling)
    - Debounce/throttle subscriptions
    - Lazy load user avatars
    - CSS-in-JS or Tailwind for scalability

12. **Monitoring & Observability**
    - OpenTelemetry tracing
    - Prometheus metrics (connection count, msg/sec)
    - Health check endpoint improvements
    - Dashboard (Grafana)
    - Error tracking (Sentry)

### 🟢 Low Priority / Nice-to-Have

13. **Deployment & DevOps**
    - Docker Compose for local development
    - Kubernetes manifests for production
    - Environment-specific configs
    - Database migrations tooling
    - Secrets management

14. **Advanced Features**
    - File/image sharing
    - Voice/video call initiation
    - Bot API for integrations
    - Message translation
    - AI-powered moderation

15. **Documentation**
    - API endpoint docs (Swagger/OpenAPI)
    - Developer guide for extending
    - Deployment guide
    - Troubleshooting FAQ
    - Architecture decision records (ADRs)

16. **Analytics**
    - User engagement metrics
    - Room popularity stats
    - Peak connection tracking
    - Message volume trends

---

## Quick Reference

### Common Commands

#### Start dev environment

```bash
# Terminal 1: Server
cd server && pnpm run dev

# Terminal 2: Client
cd client && pnpm run dev
```

#### Build production

```bash
# Backend (compiled to dist/)
cd server && npm run build

# Frontend (compiled to dist/)
cd client && npm run build
```

#### Check Redis

```bash
redis-cli
> KEYS *              # All keys
> INFO               # Server info
> MONITOR            # Real-time commands
```

#### View logs

```bash
# Server logs go to stdout
# Search for "Worker started" to confirm workers running

# Check proxy health
curl http://localhost:3000/health

# Check gateway health
curl http://localhost:3001/health
```

#### Clean up

```bash
# Kill all Node processes
pkill -f node

# Flush Redis (⚠️ WARNING: destructive)
redis-cli FLUSHALL
```

---

## Summary

| Aspect              | Status        | Notes                                      |
| ------------------- | ------------- | ------------------------------------------ |
| **Core Chat**       | ✅ Done       | Messages, rooms, real-time                 |
| **Presence**        | ✅ Done       | Online status, member list                 |
| **Scalability**     | ✅ Foundation | Cluster + Redis, needs production testing  |
| **Auth**            | ⚠️ Partial    | Client-side JWT, needs server-side         |
| **Message History** | ✅ Done       | Replay chunks via Redis Streams            |
| **Error Handling**  | ⚠️ Basic      | Works but needs more coverage              |
| **Testing**         | ❌ None       | Unit/integration tests needed              |
| **UI/UX**           | ⚠️ Minimal    | Functional but plain, needs polish         |
| **Deployment**      | ❌ None       | Docker/K8s configs needed                  |
| **Documentation**   | ⚠️ Partial    | This file + code comments, API docs needed |

**Overall**: The system is **feature-complete for a learning project** and **ready for local testing**. To move to production, prioritize: authentication, error handling, tests, and UI polish.

---

## Contributing & Next Steps

1. Pick a task from "What's Left to Do" (prioritized by section)
2. Create feature branch: `git checkout -b feature/your-feature`
3. Make changes, test locally
4. Push and create PR with description
5. Code review before merge

**Start with**: Server-side auth (POST /api/auth/login) or rooms API, then tests.
