const EVENT_NAMES = new Set([
  "product_discovery_section_viewed",
  "product_discovery_retry_requested",
  "commerce_match_clicked",
  "commerce_search_copied",
  "commerce_action_unavailable"
]);

const ENTITY_KEYS = new Set([
  "plan_version_id",
  "product_discovery_run_id",
  "subject_id",
  "match_id",
  "product_id"
]);

const ATTRIBUTE_KEYS = new Set([
  "commerce_action_type",
  "source_type"
]);

function controlledStrings(values, allowlist, pattern) {
  return Object.fromEntries(
    Object.entries(values || {}).filter(
      ([key, value]) =>
        allowlist.has(key) &&
        typeof value === "string" &&
        value.length > 0 &&
        value.length <= 100 &&
        pattern.test(value)
    )
  );
}

export function buildProductDiscoveryEvent(
  eventName,
  values,
  {
    eventId = globalThis.crypto?.randomUUID?.() || `pd-${Date.now().toString(36)}`,
    clientTime = new Date().toISOString()
  } = {}
) {
  if (!EVENT_NAMES.has(eventName)) {
    throw new TypeError(`Unsupported product discovery event: ${eventName}`);
  }
  return {
    event_name: eventName,
    event_id: eventId,
    client_time: clientTime,
    entry: "renewal_result",
    entity_ids: controlledStrings(
      values,
      ENTITY_KEYS,
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/
    ),
    attributes: controlledStrings(
      values,
      ATTRIBUTE_KEYS,
      /^[a-z][a-z0-9_]{0,63}$/
    )
  };
}
