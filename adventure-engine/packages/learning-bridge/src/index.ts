/**
 * Learning bridge `laerligverse.bridge/2` (D-306): protocol, host end, game end and the backend interface.
 * The test adapter is deliberately NOT exported here; import it from "@adventure-engine/learning-bridge/test-service".
 */
export * from "./protocol.ts";
export * from "./service.ts";
export { BridgeHost, type BridgeHostOptions, type KeyValueStore, type Timers } from "./host.ts";
export { BridgeClient, BridgeError, type BridgeClientOptions, type ClientStatus } from "./client.ts";
