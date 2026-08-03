import { DomainEventMap } from "../domain/events/DomainEventMap.js";

export type Unsubscribe = () => void;

/**
 * Port for publishing and subscribing to domain events. Adapters
 * (in-process EventEmitter, Redis pub/sub, Kafka, ...) implement this;
 * domain/application code depends only on this contract.
 *
 * DELIVERY SEMANTICS ARE ADAPTER-DEFINED, NOT GUARANTEED HERE. Whether
 * delivery is at-most-once or at-least-once (possible redelivery), and
 * whether publish() resolves before or after subscriber handlers finish
 * running, both depend entirely on the concrete adapter. Callers must
 * not assume either. Consumers that cannot tolerate duplicate delivery
 * must be idempotent, or the caller must pick an adapter guaranteeing
 * at-most-once.
 *
 * SUBSCRIBER ISOLATION IS A HARD REQUIREMENT, not adapter-optional: one
 * subscriber throwing or rejecting MUST NOT prevent other subscribers
 * from receiving the same event, and MUST NOT propagate up through
 * publish() into the publisher (e.g. a Worker's main processing loop).
 * Every adapter implementation must catch and isolate handler errors
 * internally — a buggy alerting handler must never be able to block or
 * crash DLQ-write logic.
 */
export interface EventBus {
  publish<K extends keyof DomainEventMap>(
    event: DomainEventMap[K],
  ): Promise<void>;

  /**
   * Filtered by event name — a handler subscribed to "job.failed" is
   * never invoked for "job.completed", so subscribers don't each pay
   * the cost of self-filtering on every event the bus carries.
   *
   * Returns an Unsubscribe function rather than requiring the caller to
   * retain a separate handler reference for removal — avoids the
   * classic EventEmitter leak pattern of subscribing without ever being
   * able to find the original reference to remove later.
   */
  subscribe<K extends keyof DomainEventMap>(
    eventName: K,
    handler: (event: DomainEventMap[K]) => void | Promise<void>,
  ): Unsubscribe;
}
