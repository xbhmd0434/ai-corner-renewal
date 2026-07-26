import { randomUUID } from "node:crypto";
import { assertNoOwnerId, invalid } from "../errors.js";

const EVENT_NAMES = new Set([
  "video_apply_opened",
  "asset_created",
  "asset_saved",
  "asset_parse_succeeded",
  "asset_parse_failed",
  "design_request_created",
  "generation_started",
  "generation_succeeded",
  "generation_failed",
  "generation_fallback_used",
  "plan_viewed",
  "plan_saved",
  "plan_revision_started",
  "product_list_opened",
  // renewal-card/2.1 新增事件
  "intent_confirmed",
  "scene_switched",
  "related_design_opened",
  "publication_requested",
  "implementation_opened",
  "cart_handoff_requested"
]);

const ENTITY_KEYS = new Set([
  "asset_id",
  "design_request_id",
  "generation_run_id",
  "plan_asset_id",
  "plan_version_id",
  "product_id"
]);
const TOP_LEVEL_KEYS = new Set([
  "event_name",
  "event_id",
  "client_time",
  "entry",
  "entity_ids",
  "attributes"
]);
const ATTRIBUTE_KEYS = new Set([
  "trigger",
  "source_mode",
  "status",
  "asset_type",
  "lifecycle",
  "action_type",
  "reason_code",
  "parse_state",
  "budget_bucket",
  "product_count",
  "version"
]);
const FORBIDDEN_PATTERN =
  /data:|base64|https?:\/\/|authorization|cookie|token|user_text|prompt|caption/i;

function safeControlledValue(value, depth = 0) {
  if (depth > 2) return false;
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (typeof value === "string") {
    return value.length <= 100 && !FORBIDDEN_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.length <= 20 && value.every((item) => safeControlledValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return (
      Object.keys(value).length <= 20 &&
      Object.entries(value).every(
        ([key, item]) =>
          /^[a-z][a-z0-9_]{0,63}$/.test(key) &&
          !FORBIDDEN_PATTERN.test(key) &&
          safeControlledValue(item, depth + 1)
      )
    );
  }
  return false;
}

export class EventService {
  constructor({ repository, now = () => new Date() }) {
    this.repository = repository;
    this.now = now;
  }

  ingest(actorId, body) {
    assertNoOwnerId(body);
    if (
      body &&
      typeof body === "object" &&
      Object.keys(body).some((key) => !["schema_version", "events"].includes(key))
    ) {
      throw invalid("event_batch_invalid", "事件批次包含不支持的字段");
    }
    if (
      body?.schema_version !== "1.0" ||
      !Array.isArray(body.events) ||
      body.events.length < 1 ||
      body.events.length > 100
    ) {
      throw invalid("event_batch_invalid", "events 必须包含 1～100 条事件");
    }
    const batchId = `event-batch-${randomUUID()}`;
    const accepted = [];
    const rejected = [];
    for (const event of body.events) {
      const code = this.#validateEvent(event);
      if (code) {
        rejected.push({
          event_id:
            typeof event?.event_id === "string" ? event.event_id : null,
          code
        });
      } else {
        accepted.push(event);
      }
    }
    this.repository.transaction(() => {
      for (const event of accepted) {
        this.repository.saveEvent(actorId, batchId, event);
      }
    });
    return {
      schema_version: "1.0",
      batch_id: batchId,
      accepted_count: accepted.length,
      rejected_count: rejected.length,
      rejected
    };
  }

  #validateEvent(event) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      return "event_invalid";
    }
    if (Object.keys(event).some((key) => !TOP_LEVEL_KEYS.has(key))) {
      return "event_field_not_allowed";
    }
    if (!EVENT_NAMES.has(event.event_name)) return "event_name_not_allowed";
    if (
      typeof event.event_id !== "string" ||
      !event.event_id.trim() ||
      event.event_id.length > 100
    ) {
      return "event_id_invalid";
    }
    if (
      event.client_time !== undefined &&
      (typeof event.client_time !== "string" ||
        !Number.isFinite(Date.parse(event.client_time)))
    ) {
      return "client_time_invalid";
    }
    if (
      event.entry !== undefined &&
      (typeof event.entry !== "string" ||
        event.entry.length > 64 ||
        !/^[a-z][a-z0-9_]*$/.test(event.entry))
    ) {
      return "entry_invalid";
    }
    if (event.entity_ids !== undefined) {
      if (
        !event.entity_ids ||
        typeof event.entity_ids !== "object" ||
        Array.isArray(event.entity_ids) ||
        Object.entries(event.entity_ids).some(
          ([key, value]) =>
            !ENTITY_KEYS.has(key) ||
            typeof value !== "string" ||
            !value.trim() ||
            value.length > 200
        )
      ) {
        return "entity_ids_invalid";
      }
    }
    if (
      event.attributes !== undefined &&
      (!event.attributes ||
        typeof event.attributes !== "object" ||
        Array.isArray(event.attributes) ||
        Object.keys(event.attributes).some((key) => !ATTRIBUTE_KEYS.has(key)) ||
        !safeControlledValue(event.attributes))
    ) {
      return "attributes_not_allowed";
    }
    return null;
  }
}
