# Architecture Design Document



---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Choices](#2-technology-choices)
3. [Data Modeling: The Embedded `financialBreakdown` Decision](#3-data-modeling-the-embedded-financialbreakdown-decision)
4. [State Machine: Strict Backend Enforcement of Stage Transitions](#4-state-machine-strict-backend-enforcement-of-stage-transitions)
5. [Pure Functions: `commission-calculator` and Testability](#5-pure-functions-commission-calculator-and-testability)
6. [Atomic Updates: Concurrency Protection](#6-atomic-updates-concurrency-protection)
7. [Authorization: API-Level Data Isolation (RBAC)](#7-authorization-api-level-data-isolation-rbac)
8. [Frontend Architecture: Pinia, Debounce, and Paginated Table](#8-frontend-architecture-pinia-debounce-and-paginated-table)
9. [Security Measures](#9-security-measures)
10. [Testing Strategy](#10-testing-strategy)
11. [Trade-offs and Future Work](#11-trade-offs-and-future-work)

---

## 1. System Overview

The application tracks a real-estate agency's sales transactions through a four-stage pipeline (agreement → earnest money → title deed → completed) and automatically splits the commission between the agency and the involved agents once the transaction is completed.

The system is composed of two independent services:

- **Backend** — A NestJS 11 REST API. It uses MongoDB through Mongoose and handles authentication via JWT.
- **Frontend** — A Nuxt 3 (Vue 3 Composition API) SPA. Central state management is handled by Pinia.

The contract between the two services is pure JSON over HTTP. This boundary allows the frontend to be replaced by another client (for example, a mobile app) without touching the backend, and the backend to be scaled independently.

---

## 2. Technology Choices

| Layer | Choice | Core Rationale |
| --- | --- | --- |
| Backend framework | NestJS 11 | Modular structure, decorator-based DI, and Guard/Pipe/Interceptor layers produce a maintainable codebase at enterprise scale. |
| Database | MongoDB + Mongoose | First-class support for embedded documents, flexible schema evolution, and atomic operations such as `findOneAndUpdate` as a native API. |
| Authentication | JWT (Passport) | Stateless and horizontally scalable; the frontend stores it in a cookie and sends it on every request via the `Authorization` header. |
| Frontend framework | Nuxt 3 | File-based routing, SSR capability, and a fast Vite-backed development loop. |
| State management | Pinia | Strong TypeScript support, a clear getter/action model, and first-class Nuxt integration. |
| UI | Tailwind CSS | The utility-first approach guarantees design consistency and keeps the bundle small. |
| Validation | `class-validator` + `ValidationPipe` | Declarative validation at the DTO layer with type-safe runtime guarantees. |

---

## 3. Data Modeling: The Embedded `financialBreakdown` Decision

### The Decision

The commission breakdown (`companyCut`, `listingAgentCut`, `sellingAgentCut`) is **not** stored in a separate collection. It is written directly onto the `Transaction` document as an **embedded document**.

```typescript
// backend/src/transactions/schemas/transaction.schema.ts
@Prop({ type: FinancialBreakdownSchema, required: false })
financialBreakdown?: FinancialBreakdown;
```

### Why Embedded?

This decision rests on three strong arguments, each of which is critical to the long-term correctness of the product.

**1. Accounting Integrity — The Snapshot Principle**

Commission ratios are business rules, and business rules are expected to change over time. The agency cut may be `50%` today and drop to `40%` next year. If `financialBreakdown` were derived dynamically from the commission service, a **transaction that was closed six months ago** would be **recomputed with today's rates** the moment someone opened its financial report, and its historical accounting would silently break.

The embedded approach takes an **immutable snapshot** of the commission distribution at the exact moment the transaction transitions to `COMPLETED`, and persists that snapshot alongside the transaction. Even when the rules change in the future, historical records remain untouched. This is a well-known pattern in financial systems, sometimes described as "event sourcing lite" or "immutable accounting snapshot".

**2. Read Performance**

Every page load that displays transaction detail also requires the commission breakdown. If it lived in a separate collection, every detail query would require an extra join (`$lookup` in MongoDB). The embedded structure delivers the entire document in **a single `findOne` call**.

**3. Atomic Write**

When a transaction is completed, both the stage change and the commission breakdown must be written. Performing both writes **on the same document in the same MongoDB operation** eliminates inconsistent intermediate states. A separate-collection design would demand either a distributed transaction or a compensation mechanism.

### Why Not a Separate Collection?

A dedicated `CommissionBreakdown` collection would be the reflex of someone trained in normalized relational modeling. In this context, however, it would:

- expose historical records to the effects of future rule changes,
- add the cost of an extra `$lookup` to every read,
- require a concurrency lock spanning the transaction document and its breakdown.

Given the product constraints — one transaction has exactly one breakdown, and they are always read together — the embedded structure wins decisively on both performance and correctness.

---

## 4. State Machine: Strict Backend Enforcement of Stage Transitions

### The Problem

A transaction moves through four stages:

```
AGREEMENT → EARNEST_MONEY → TITLE_DEED → COMPLETED
```

This ordering is a hard business rule: a transaction cannot skip the earnest-money step and jump straight to the title deed. If the rule were enforced only on the frontend, a malicious or buggy client could call `PATCH /transactions/:id/stage` directly and bypass stages at will.

### The Solution: A Transition Matrix as Pure Data

The allowed transitions are declared in a utility module as a plain data structure:

```typescript
// backend/src/transactions/utils/stage-transitions.ts
const ALLOWED_TRANSITIONS: Readonly<Record<TransactionStage, TransactionStage[]>> = {
  [TransactionStage.AGREEMENT]:     [TransactionStage.EARNEST_MONEY],
  [TransactionStage.EARNEST_MONEY]: [TransactionStage.TITLE_DEED],
  [TransactionStage.TITLE_DEED]:    [TransactionStage.COMPLETED],
  [TransactionStage.COMPLETED]:     [],
};

export function canTransition(current: TransactionStage, next: TransactionStage): boolean {
  return ALLOWED_TRANSITIONS[current].includes(next);
}
```

Every `updateStage` request passes through three layers of defense:

1. **DTO validation** — the `stage` field cannot hold any value outside the `TransactionStage` enum.
2. **`canTransition` check** — is the transition from the current stage to the requested stage declared in the matrix?
3. **Atomic MongoDB precondition** — the update query requires the stage to still equal the value read a moment earlier (see Section 6).

The design follows the "fail fast" principle: an invalid transition is rejected with `400 Bad Request` before it ever reaches the database.

### Why Pure Data?

Expressing transitions as a **plain object** rather than as `if/else` chains or class methods delivers two concrete benefits:

- **Readability** — even a business analyst can open the file and read the rule.
- **Extensibility** — when a new stage is introduced, only a row is added to the matrix; `canTransition` stays untouched.

---

## 5. Pure Functions: `commission-calculator` and Testability

### The Decision

The commission calculation is not a method on a service class. It is a **pure function, fully isolated from the database**.

```typescript
// backend/src/transactions/utils/commission-calculator.ts
export function calculateCommission(
  totalFee: number,
  listingAgentId: Types.ObjectId,
  sellingAgentId: Types.ObjectId,
): Required<FinancialBreakdown> {
  const companyCut = totalFee * AGENCY_SHARE_RATIO;
  const agentPool = totalFee - companyCut;
  const isSameAgent = listingAgentId.equals(sellingAgentId);

  if (isSameAgent) {
    return { companyCut, listingAgentCut: agentPool, sellingAgentCut: 0 };
  }
  const splitCut = agentPool / 2;
  return { companyCut, listingAgentCut: splitCut, sellingAgentCut: splitCut };
}
```

### The Testability Advantage

This function has no class dependencies, no Mongoose models, and no I/O. Its input-to-output mapping is fully deterministic.

That property is a massive win for unit testing:

- **No mocks required.** Tests call `calculateCommission(1000, idA, idB)` directly.
- **Tests run in milliseconds.** No MongoDB Memory Server, no test containers, no fixtures.
- **Edge cases become explicit.** Scenarios such as the same agent occupying both roles, `totalFee = 0`, or negative input can be exercised in isolation (see `commission-calculator.spec.ts`).

### Separating Business Rules from the Service Layer

`TransactionsService` is responsible only for **orchestration**: calling `calculateCommission` at the right moment and persisting the result correctly. The business rule **itself** does not live in the service.

This separation is one of the central recommendations of Clean Architecture and Hexagonal Architecture: *domain logic should be independent of framework and infrastructure*. If the commission rule changes tomorrow, exactly one file needs to be touched — `commission-calculator.ts`.

---

## 6. Atomic Updates: Concurrency Protection

### The Problem

What happens when two users advance the same transaction at the same time? A naive implementation would follow this sequence:

1. Request A reads the transaction → `stage = AGREEMENT`.
2. Request B reads the transaction → `stage = AGREEMENT`.
3. Request A updates `stage = EARNEST_MONEY` and appends a stage-history entry.
4. Request B, acting on the same stale read, writes `stage = EARNEST_MONEY` again and creates a **duplicate** stage-history entry.

This is the classic **lost update** scenario. The result: `stageHistory` becomes corrupted, and the audit trail is wrong.

### The Solution: Optimistic Concurrency with `findOneAndUpdate`

The update query carries two important conditions:

```typescript
// backend/src/transactions/transactions.service.ts
const updated = await this.transactionModel
  .findOneAndUpdate(
    { _id: new Types.ObjectId(id), stage: current.stage }, // PRECONDITION
    update,
    { new: true },
  );

if (!updated) {
  throw new ConflictException(
    'Transaction stage changed concurrently. Please reload and try again.',
  );
}
```

The critical point is this: the filter matches not only on `_id` but also on the **stage observed at read time**. MongoDB executes this query as a single atomic operation.

- Request A wins: the filter matches, the update applies, and the new document is returned.
- Request B loses: the stage is no longer `AGREEMENT`, the filter matches no document, and `findOneAndUpdate` returns `null`. The service turns this into a `409 Conflict`.

This approach implements **optimistic concurrency control** by relying on MongoDB's per-document atomicity guarantee — no lock table and no distributed lock mechanism required.

### Why Not a Pessimistic Lock?

A pessimistic lock would hold the document and force other requests to wait. That is a poor fit for web applications: it does not scale, it carries deadlock risk, and it can push the client into timeout. The optimistic approach costs almost nothing when conflicts are rare and, on the rare collision, surfaces a clear error message that guides the user to retry.

---

## 7. Authorization: API-Level Data Isolation (RBAC)

### Threat Model

The system defines two roles: `ADMIN` and `AGENT`. For security reasons, an agent must **not be able to list, read, or update** another agent's transactions. Hiding controls in the UI is insufficient; if a request is crafted directly with `curl`, the isolation must still hold.

### Two-Layered Protection

**Layer 1: Coarse Access Control via Guards**

`JwtAuthGuard` and `RolesGuard` are applied at the controller level. The first requires a valid JWT; the second compares the roles declared on the route via `@Roles()` against the role of the requesting user.

```typescript
// backend/src/transactions/transactions.controller.ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class TransactionsController { ... }
```

**Layer 2: Query-Level Data Isolation**

Coarse role checks are not enough, because both agents share the `AGENT` role yet must not see each other's data. For that reason `TransactionsService` injects a user-scoped filter into every query:

```typescript
// backend/src/transactions/transactions.service.ts
private buildAccessFilter(user: AuthenticatedUser): MongoFilter {
  if (user.role === UserRole.ADMIN) {
    return {};
  }
  const userObjectId = new Types.ObjectId(user.userId);
  return {
    $or: [{ listingAgent: userObjectId }, { sellingAgent: userObjectId }],
  };
}
```

The filter is applied automatically to **every read and write query**, including `findAllPaginated`, `findOne`, and `updateStage`. The outcome:

- `ADMIN` sees all transactions.
- `AGENT` sees only transactions where they appear as `listingAgent` or `sellingAgent`.
- Guessing another agent's transaction id and calling `GET /transactions/:id` returns `404 Not Found` (`404` rather than `403` on purpose, to avoid leaking the existence of the resource).

This is the MongoDB equivalent of the "row-level security" pattern and enforces isolation **below the controller layer**, where it is hardest to forget.

### 7.1 Supporting Indexes

Because the access filter and sort order are applied on **every** read, the schema is explicit about which indexes support them:

```typescript
// backend/src/transactions/schemas/transaction.schema.ts
TransactionSchema.index({ createdAt: -1 });
TransactionSchema.index({ stage: 1, createdAt: -1 });
TransactionSchema.index({ listingAgent: 1, createdAt: -1 });
TransactionSchema.index({ sellingAgent: 1, createdAt: -1 });
```

Each compound index follows the same pattern: a high-selectivity predicate first (`stage`, `listingAgent`, `sellingAgent`) and the sort key last (`createdAt: -1`). This lets MongoDB serve the RBAC-filtered dashboard — which always ends with `.sort({ createdAt: -1 })` — using a single index scan without an in-memory sort, even when the collection grows.

---

## 8. Frontend Architecture: Pinia, Debounce, and Paginated Table

### 8.1 Centralized State Management with Pinia

The frontend is organized around three Pinia stores:

- `stores/auth.ts` — session information, role checks, and token management.
- `stores/transaction.ts` — transaction list, pagination state, active filters, loading and error flags.
- `stores/user.ts` — the list of agents used in the admin view.

This layout eliminates the need for "props drilling" between components. When the transactions page changes a filter, it only updates the store; the table, pagination, and filter badges react to the change automatically.

Because the store is the single source of truth, reconstructing filters and the current page after a page reload is trivial.

### 8.2 500ms Debounce on the Search Bar

A naive search implementation fires an API request on every keystroke. A user typing "Kadıköy" would produce seven requests, six of which are wasted work.

The `pages/index.vue` file solves this with a precise 500ms debounce:

```typescript
// frontend/pages/index.vue
const SEARCH_DEBOUNCE_MS = 500
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(searchInput, (next) => {
  if (searchTimer !== null) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = null
    if (next === transactionStore.search) return
    void transactionStore.fetchTransactions({ search: next, resetPage: true })
  }, SEARCH_DEBOUNCE_MS)
})
```

The critical details:

- Each keystroke cancels the previous timer. The request fires only when the user has stopped typing for 500 ms.
- When the timer finally executes, the request is skipped if the value already matches the store (for example, if the user typed something and then deleted it).
- `resetPage: true` — changing filters returns the page number to `1`; otherwise a user on page 3 could apply a new filter and be greeted by an empty result.

The outcome: API load drops by roughly 7×, and perceived performance improves noticeably.

### 8.3 Paginated Table with Nuxt

The backend response always follows this contract:

```typescript
interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}
```

The frontend derives Previous/Next availability from a single `page < totalPages && totalPages > 0` check — no redundant boolean flags travel over the wire. The store translates this contract into "Page X / Y" labels and Previous/Next buttons below the table. Every filter (search, stage, fee range, date range, agent) flows through the same `fetchTransactions` action; building the query string is the store's responsibility. That prevents the API call from being duplicated across components.

### 8.4 The `useApi` Composable and Token Flow

All HTTP calls from the frontend go through a single composable:

```typescript
// frontend/composables/useApi.ts
return $fetch.create({
  baseURL: config.public.apiBase,
  onRequest({ options }) {
    if (tokenCookie.value) {
      headers.set('Authorization', `Bearer ${tokenCookie.value}`)
    }
  },
  async onResponseError({ response }) {
    if (response.status === 401) {
      tokenCookie.value = null
      if (import.meta.client) await navigateTo('/login')
    }
  },
})
```

This design handles two cross-cutting concerns in one place:

- **Authentication** — every request automatically carries the Bearer token.
- **Session expiration** — a `401` response clears the token and redirects the user to the login page.

All other stores and pages use this composable; no component calls `fetch` or `axios` directly.

---

## 9. Security Measures

The application mitigates the standard OWASP Top 10 risks with the following measures.

| Risk | Mitigation |
| --- | --- |
| Password leakage | `bcrypt` hashing with `10` salt rounds; `User.password` carries `select: false`, so it is never returned by default queries. |
| Login brute force | `@Throttle({ limit: 10, ttl: 60_000 })` applied specifically to `/auth/login`; a global throttler covers all routes. |
| XSS / Injection | `helmet` middleware; `ValidationPipe` with `forbidNonWhitelisted: true` rejects any request that contains undeclared fields. |
| Regex DoS | In the search filter, regex metacharacters from user input (`.*+?^${}()|[]\`) are escaped inside `buildSearchFilter`. |
| CORS | Controlled through the `CORS_ORIGIN` environment variable; credentialed requests are accepted only from the allow-list. |
| JWT | The secret is loaded from an environment variable; if `JWT_SECRET` is missing, the application fails fast at startup. |
| Internal error leakage | `AllExceptionsFilter` converts unknown exceptions into a generic `500 InternalServerError` and logs the real stack trace server-side only. |
| Misconfiguration | `validateEnv` runs at startup and rejects the boot if any required variable (`MONGODB_URI`, `JWT_SECRET`) is missing or malformed. |

### 9.1 Environment Validation — Fail-Fast at Boot

Rather than checking environment variables lazily (per request, inside each provider), the application declares its required configuration as a `class-validator`-annotated class and hooks it into `ConfigModule.forRoot({ validate })`:

```typescript
// backend/src/config/env.validation.ts
class EnvironmentVariables {
  @IsString() @IsNotEmpty() MONGODB_URI!: string;
  @IsString() @IsNotEmpty() JWT_SECRET!: string;
  @IsOptional() @IsInt() @Min(1) PORT?: number;
  // ...
}
```

A missing `JWT_SECRET` no longer triggers a confusing `500` on the first `/auth/login` call. The boot process fails immediately with a one-screen error that points the operator at `.env.example`. Fail-fast is cheaper than chasing a ghost error in production.

### 9.2 Global Exception Filter — Uniform Error Shape

Every error leaves the backend through `AllExceptionsFilter`, which produces a single stable response shape:

```json
{ "statusCode": 404, "message": "Transaction X not found", "error": "NotFoundException", "path": "/transactions/X", "timestamp": "2026-04-21T21:09:18.763Z" }
```

The filter has three responsibilities:

1. **Pass through `HttpException` subclasses** — their status and message are already appropriate for the client.
2. **Translate Mongoose errors** — `CastError` and `ValidationError` become `400 Bad Request` with a human-readable message.
3. **Isolate the unknown** — anything else is converted to `500 InternalServerError` with a generic body, while the original stack trace is written to the server log. Internal details (DB driver messages, stack frames, library internals) never reach the client.

### 9.3 Request Logging

A thin `RequestLoggerMiddleware` prints one line per HTTP response:

```
LOG  [HTTP] GET /health -> 200 (6.7ms)
WARN [HTTP] GET /transactions -> 401 (1.4ms)
```

The log level follows the status: `2xx → LOG`, `4xx → WARN`, `5xx → ERROR`. It emits no body and no headers, so no sensitive data (tokens, passwords, PII) leaks into log aggregation.

---

## 10. Testing Strategy

The testing strategy relies on the isolation principle described in Section 5. Because domain logic is concentrated in pure functions, the whole test suite is written without touching infrastructure — no MongoDB Memory Server, no test containers, no fixtures.

The suite is organized in two layers: a wide base of fast unit tests on pure functions, and a mid-layer of service tests that mock the Mongoose model.

### 10.1 Unit Tests — Pure Functions

**`backend/src/transactions/utils/commission-calculator.spec.ts`** — validates every branch of the commission rule deterministically, without any mocks or I/O.

| Scenario | Test case | Intent |
| --- | --- | --- |
| Same listing & selling agent | `gives the full agent pool to the single agent` | With a 100,000 fee the single agent takes 50,000 and the selling cut is 0. |
| Same listing & selling agent | `works when both parameters are different ObjectId instances with the same value` | `.equals()` is used instead of reference equality. |
| Different agents | `splits the agent pool equally (25% / 25%)` | With a 100,000 fee both agents receive 25,000. |
| Different agents | `honors the configured agency share ratio` | `companyCut` always equals `totalFee * AGENCY_SHARE_RATIO`. |
| Edge cases | `returns all zeros when totalFee is 0` | A zero fee yields three zeroes. |
| Edge cases | `returns all zeros when totalFee is 0 and agents are the same` | The same-agent branch does not inflate a zero fee. |
| Edge cases | `throws when totalFee is negative` | Negative amounts fail fast with a clear message. |
| Edge cases | `throws when totalFee is NaN` | `NaN` is rejected in the same guard. |

**`backend/src/transactions/utils/stage-transitions.spec.ts`** — drives the transition matrix with table-driven `it.each` assertions.

| Group | Coverage |
| --- | --- |
| `valid forward transitions` | `AGREEMENT → EARNEST_MONEY`, `EARNEST_MONEY → TITLE_DEED`, `TITLE_DEED → COMPLETED`. |
| `skipping stages is forbidden` | `AGREEMENT → TITLE_DEED`, `AGREEMENT → COMPLETED`, `EARNEST_MONEY → COMPLETED`. |
| `backward transitions are forbidden` | All six downward transitions among the four stages. |
| `self transitions are forbidden` | `X → X` for every stage. |
| `COMPLETED is a terminal state` | No transition is possible out of `COMPLETED`. |

### 10.2 Service Tests — Mongoose Mocked

**`backend/src/transactions/transactions.service.spec.ts`** — verifies orchestration, authorization, and the stage-machine contract by stubbing the Mongoose model with in-memory `jest` mocks.

| Feature | Test case | Intent |
| --- | --- | --- |
| `create` | `inserts a transaction with an initial AGREEMENT stage history entry` | A new transaction starts in `AGREEMENT` and its first `stageHistory` entry is written by the creating user. |
| `create` | `forbids agents from creating transactions where they are not involved` | An agent cannot create a transaction for two other agents (`ForbiddenException`). |
| `create` | `allows agents that list themselves as the listing agent` | An agent may create a transaction in which they appear as `listingAgent`. |
| `updateStage` | `throws NotFoundException when the transaction does not exist` | Missing id surfaces a 404. |
| `updateStage` | `throws BadRequestException for invalid forward transitions` | `AGREEMENT → COMPLETED` is rejected before any write. |
| `updateStage` | `throws BadRequestException when already in the requested stage` | A self-transition is rejected. |
| `updateStage` | `persists the next stage and stage history on a valid transition` | The `$set` and `$push` payloads, and the filter that preconditions on the previous stage, are all correct. |
| `updateStage` | `computes financialBreakdown when transitioning to COMPLETED` | 100,000 → `{ company: 50,000, listing: 25,000, selling: 25,000 }` is written atomically on the final transition. |
| `updateStage` | `throws ConflictException when another writer changed the stage first` | The optimistic-concurrency check (see Section 6) maps a `null` result to HTTP 409. |
| `findOne` access control | `applies an access filter for agents to prevent viewing foreign transactions` | Agent queries receive an `$or` filter (see Section 7). |
| `findOne` access control | `does not restrict admins via an access filter` | Admin queries carry no `$or` filter. |

Together, these two layers cover the three responsibilities that cannot be checked by the type system alone: financial arithmetic, the state machine, and role-based access control. HTTP wiring (auth guards, pipes, filters) is exercised at dev time against the live API and through Swagger's interactive console rather than a duplicated e2e harness.

---

## 11. Trade-offs and Future Work

No design decision is free of cost. The limitations knowingly accepted by the current choices are:

- **Because `financialBreakdown` is embedded,** moving the commission breakdown into a dedicated reporting service would require a migration. This is acceptable because the immutability of historical data is the higher-priority goal.
- **Optimistic concurrency** surfaces a manual "retry" message to the user on conflict. In areas with heavy contention (which do not apply here), a pessimistic lock or queue-based serialization would be a better fit. Collisions are the exception in this product's usage profile.
- **RBAC has two levels** (`ADMIN`, `AGENT`). If intermediate roles such as "team lead" are introduced, the `UserRole` enum and `buildAccessFilter` must be extended; the current structure makes that straightforward.
- **The frontend debounce is fixed at 500 ms.** It may feel too long for fast typists and too short for slow ones. A later iteration can expose it as a user preference.

Possible improvements for future iterations: live stage updates over WebSocket, a read replica dedicated to reporting, and a full audit-log view built on top of `stageHistory`.

---

*This document must stay in sync with the code. When an architectural decision changes, the relevant section should be revised.*

---

## Live Deployment

- **Frontend:** https://estate-comission-app.vercel.app (Vercel)
- **Backend:** https://estate-comission-app.onrender.com (Render)
- **Health probe:** https://estate-comission-app.onrender.com/health

The backend connects to a MongoDB Atlas M0 cluster. Secrets (database URI,
JWT secret, CORS origin) live in each hosting provider's environment
configuration and are never committed to the repository.

