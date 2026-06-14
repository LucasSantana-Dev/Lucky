# Message broker (RabbitMQ / Kafka): not adopted — keep Redis pub/sub

- Status: accepted (no change)
- Date: 2026-06-13

## Context

Question raised: "Should we use something like RabbitMQ or Kafka?"

The system's entire inter-process messaging footprint, verified against `main`:

- Deployment is a **single homelab `docker-compose` host**: one bot process, one
  backend (Express), one Postgres, one `redis:8-alpine` (`--maxmemory 256mb`,
  single node, no cluster, no replicas). No horizontal scaling anywhere.
- Exactly **two services** use any broker, over **four channels**, all Redis
  pub/sub:
    - `MusicControlService` — `music:command` (backend→bot), `music:result`
      (bot→backend, request/reply with correlation IDs + 10s timeout),
      `music:state` (bot→backend state push). Human-driven, low rate.
    - `TwitchControlService` — `twitch:refresh`, a fire-and-forget 1-byte signal
      (#870). Very low rate.
- Delivery is **best-effort by design**: Redis down → the music command fails the
  user's immediate action; the Twitch signal is skipped and the bot picks up the
  Postgres change on its next restart. Postgres is the source of truth. Nothing
  requires durable/at-least-once delivery, ordering, replay, persistence, or
  multi-consumer fan-out.
- Standing posture (`2026-05-31-redis-scope-reduction`): **Redis = pub/sub only**;
  KV/cache already migrated to Postgres.

There is **no forcing function** — no throughput, durability, fan-out, ordering, or
replay requirement that the current transport fails to meet.

## Decision

**Do not adopt RabbitMQ, Kafka, or NATS. Keep Redis pub/sub as-is.** A message
broker solves problems (durable queues, partitioned streaming, at-least-once acks,
multi-consumer fan-out, replay) that this system does not have at single-instance
homelab scale with ~1 human-driven event/sec across four channels. Adopting one now
is ~50h of plumbing plus ongoing ops cost for zero current benefit.

One follow-up the review surfaced (cheap, worth doing independently of any broker):
**instrument broker-unavailable failures** — emit a metric / Sentry breadcrumb when
`publishRefresh()` or the music `sendCommand()` publish fails, so Redis trouble is
caught before users report it. The failure paths already log + degrade gracefully;
this just makes the degradation observable.

## Alternatives considered

- **Kafka.** Rejected. Durable, partitioned event log — built for high-throughput
  streaming + replay across many consumers. None of that applies. High adoption
  friction (single-node tuning, topic/partition schema), JVM overhead, and strong
  lock-in (topic naming, partition keys, schema registry become canon). This is the
  option to reach for _only_ at the scale-out trigger below.
- **RabbitMQ.** Rejected. AMQP exchange/queue/binding model adds cognitive load and
  acknowledgment plumbing the best-effort design doesn't need; it would _complicate_
  the music request/reply, not simplify it. ~$10–20/mo + ops for two signals.
- **NATS (lighter broker).** Rejected. Native request/reply is genuinely nicer than
  raw pub/sub, but it introduces a third messaging ideology and new infra to save
  nothing measurable at this scale. Overkill.
- **Migrate the four channels to Postgres `LISTEN/NOTIFY`, drop Redis entirely.**
  Rejected _for now_ (it's the most interesting alternative given the Redis-
  decommission arc). It works cleanly for the one-way `twitch:refresh` signal, but
  the music **request/reply still needs the client-side `pendingResults` +
  correlation-ID machinery** because `NOTIFY` is itself fire-and-forget with no reply
  channel — so the hard part isn't simplified. A hybrid (Postgres LISTEN for Twitch,
  Redis for music) is _more_ complex than keeping both on the Redis pair already
  deployed. Revisit if Redis ever becomes an operational pain point in its own right.
- **Keep Redis pub/sub (status quo).** Chosen. Already running, ioredis is portable,
  best-effort semantics match the requirement exactly.

## Consequences

- Positive: zero new infrastructure, zero migration, no new failure surface; the
  transport already matches the (intentionally modest) delivery contract.
- Negative: best-effort delivery means a publish lost during a Redis blip is not
  retried — accepted at hobby scale, and mitigated by Postgres being the SoT (state
  reconciles on the next bot restart / dashboard refresh). The follow-up
  instrumentation closes the _observability_ gap, not the delivery gap.
- Neutral: preserves the `2026-05-31-redis-scope-reduction` posture (Redis =
  pub/sub only, Postgres = persistence) — this decision is consistent with it, not a
  regression.

## Revisit when (concrete thresholds — flip on ANY)

- **More than one bot instance** runs in production (even standby/failover). This is
  the single strongest argument for a broker: in-process state + a single Redis
  connection pair break under multi-instance, and a shared durable broker (Kafka, or
  RabbitMQ) becomes mandatory. Today single-instance is explicit, not accidental.
- **A dropped message causes a user-facing failure reported ≥2× in a week** and the
  loss is traced to Redis → move to at-least-once delivery (broker territory).
- **A feature needs event _history_** ("last N commands across sessions", an audit
  trail of state changes) → durable log, i.e. Kafka. Transient pub/sub can't serve
  it; neither can RabbitMQ/LISTEN-NOTIFY cleanly.
- **Sustained signal rate exceeds ~100 events/sec**, or ioredis logs
  "waiting for available connection" ≥1×/day (would need ~5+ new pub/sub services)
  → connection/throughput pressure worth re-architecting for. Nowhere near today's
  ~1 event/sec, 4 channels.

## References

- Operator question, 2026-06-13: "Should we use something like RabbitMQ or Kafka?"
- `packages/shared/src/services/music/MusicControlService.ts` (request/reply pub/sub)
- `packages/shared/src/services/twitch/TwitchControlService.ts` (fire-and-forget signal)
- `decisions/2026-05-31-redis-scope-reduction.md` (Redis = pub/sub only posture)
- `decisions/2026-06-13-twitch-refresh-signal-transport.md` (dedicated service over a generic bus at N=2 signals)
