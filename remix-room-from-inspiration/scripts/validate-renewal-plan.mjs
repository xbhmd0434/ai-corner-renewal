#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const SOURCE_ROLE_ORDER = new Map([
  ["video_selected", 0],
  ["source_video", 1],
  ["ai_supplement", 2]
]);
const MATCH_TYPES = new Set(["exact", "similar", "alternative", "need_search"]);
const ACTION_TYPES = new Set(["add", "organize", "remove_trash"]);
const GATE_VALUES = new Set(["pass", "needs_review", "fail"]);
const COMMERCE_FIELDS = [
  "product_id",
  "sku",
  "price",
  "stock",
  "seller",
  "purchase_url"
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasStringArray(value) {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function validate(document) {
  const errors = [];
  const add = (path, message) => errors.push(`${path}: ${message}`);
  const requireObject = (path, value) => {
    if (!isObject(value)) {
      add(path, "must be an object");
      return false;
    }
    return true;
  };
  const requireString = (path, value) => {
    if (!isNonEmptyString(value)) add(path, "must be a non-empty string");
  };

  if (!isObject(document)) return ["$: must be a JSON object"];
  if (document.contract_version !== "corner-renewal/1.0") {
    add("$.contract_version", 'must equal "corner-renewal/1.0"');
  }
  if (!["ready", "needs_input"].includes(document.status)) {
    add("$.status", 'must be "ready" or "needs_input"');
  }
  if (!["plan_only", "rendered", "rendered_evaluated"].includes(document.maturity)) {
    add("$.maturity", "has an unsupported value");
  }

  const inspirationOk = requireObject("$.inspiration", document.inspiration);
  let intentType = null;
  let sourceComponentId = null;
  if (inspirationOk) {
    intentType = document.inspiration.intent_type;
    if (!["component", "style"].includes(intentType)) {
      add("$.inspiration.intent_type", 'must be "component" or "style"');
    }
    requireString("$.inspiration.summary", document.inspiration.summary);
    if (intentType === "component") {
      const reference = document.inspiration.component_reference;
      if (requireObject("$.inspiration.component_reference", reference)) {
        requireString(
          "$.inspiration.component_reference.source_component_id",
          reference.source_component_id
        );
        sourceComponentId = reference.source_component_id;
        requireString("$.inspiration.component_reference.category", reference.category);
        for (const field of ["colors", "materials", "shapes"]) {
          if (!hasStringArray(reference[field])) {
            add(`$.inspiration.component_reference.${field}`, "must be an array of strings");
          }
        }
      }
    }
    if (
      intentType === "style" &&
      !requireObject("$.inspiration.style_reference", document.inspiration.style_reference)
    ) {
      // Error recorded by requireObject.
    } else if (intentType === "style") {
      for (const field of ["palette", "materials", "lighting", "layout"]) {
        if (!hasStringArray(document.inspiration.style_reference[field])) {
          add(`$.inspiration.style_reference.${field}`, "must be an array of strings");
        }
      }
    }
  }

  if (requireObject("$.scene", document.scene)) {
    requireString("$.scene.scene_type", document.scene.scene_type);
    for (const field of ["fixed_structure", "preserve", "editable_regions"]) {
      if (!hasStringArray(document.scene[field])) {
        add(`$.scene.${field}`, "must be an array of strings");
      }
    }
  }

  if (requireObject("$.plan", document.plan)) {
    requireString("$.plan.title", document.plan.title);
    requireString("$.plan.design_direction", document.plan.design_direction);
    requireString("$.plan.render_instruction", document.plan.render_instruction);
    if (!hasStringArray(document.plan.negative_constraints)) {
      add("$.plan.negative_constraints", "must be an array of strings");
    }

    if (!Array.isArray(document.plan.actions) || document.plan.actions.length > 8) {
      add("$.plan.actions", "must be an array with at most 8 entries");
    } else {
      for (const [index, action] of document.plan.actions.entries()) {
        const path = `$.plan.actions[${index}]`;
        if (!isObject(action)) {
          add(path, "must be an object");
          continue;
        }
        if (!ACTION_TYPES.has(action.type)) add(`${path}.type`, "has an unsupported value");
        requireString(`${path}.target`, action.target);
        requireString(`${path}.placement`, action.placement);
        requireString(`${path}.instruction`, action.instruction);
      }
      if (intentType === "component" && sourceComponentId) {
        const expectedTarget = `source_component:${sourceComponentId}`;
        const anchorCount = document.plan.actions.filter(
          (action) => action?.type === "add" && action?.target === expectedTarget
        ).length;
        if (anchorCount !== 1) {
          add(
            "$.plan.actions",
            `must contain exactly one add action targeting ${expectedTarget}`
          );
        }
      }
    }

    if (!Array.isArray(document.plan.product_slots) || document.plan.product_slots.length > 8) {
      add("$.plan.product_slots", "must be an array with at most 8 entries");
    } else {
      for (const [index, slot] of document.plan.product_slots.entries()) {
        const path = `$.plan.product_slots[${index}]`;
        if (!isObject(slot)) {
          add(path, "must be an object");
          continue;
        }
        for (const field of ["slot_id", "category", "purpose", "placement", "support"]) {
          requireString(`${path}.${field}`, slot[field]);
        }
        if (!Number.isInteger(slot.quantity) || slot.quantity < 1) {
          add(`${path}.quantity`, "must be a positive integer");
        }
        if (!hasStringArray(slot.search_queries)) {
          add(`${path}.search_queries`, "must be an array of strings");
        }
        for (const field of COMMERCE_FIELDS) {
          if (Object.hasOwn(slot, field)) {
            add(`${path}.${field}`, "product facts are forbidden in ProductSlot");
          }
        }
      }
    }
  }

  if (requireObject("$.render", document.render)) {
    if (!["not_run", "generated", "validated"].includes(document.render.status)) {
      add("$.render.status", "has an unsupported value");
    }
    if (document.render.label !== "AI 效果示意") {
      add("$.render.label", 'must equal "AI 效果示意"');
    }
    if (document.render.status === "not_run") {
      requireString("$.render.prompt", document.render.prompt);
      if (document.maturity !== "plan_only") {
        add("$.maturity", 'must be "plan_only" when render.status is "not_run"');
      }
    } else {
      requireString("$.render.output_ref", document.render.output_ref);
    }
  }

  if (requireObject("$.evaluation", document.evaluation)) {
    if (!["not_run", "pass", "needs_review", "fail"].includes(document.evaluation.status)) {
      add("$.evaluation.status", "has an unsupported value");
    }
    if (document.evaluation.status !== "not_run") {
      const gates = document.evaluation.gates;
      if (requireObject("$.evaluation.gates", gates)) {
        const gateNames = [
          "base_fidelity",
          "inspiration_fidelity",
          "physical_plausibility",
          "constraint_compliance"
        ];
        for (const gateName of gateNames) {
          if (!GATE_VALUES.has(gates[gateName])) {
            add(`$.evaluation.gates.${gateName}`, "has an unsupported value");
          }
        }
        if (
          document.evaluation.status === "pass" &&
          gateNames.some((gateName) => gates[gateName] !== "pass")
        ) {
          add("$.evaluation.status", 'cannot be "pass" unless every gate passes');
        }
      }
    }
  }

  if (document.render?.status === "validated") {
    if (document.maturity !== "rendered_evaluated") {
      add("$.maturity", 'must be "rendered_evaluated" for a validated render');
    }
    if (document.evaluation?.status !== "pass") {
      add("$.evaluation.status", 'must be "pass" for a validated render');
    }
  }

  if (requireObject("$.implementation", document.implementation)) {
    if (!Array.isArray(document.implementation.items)) {
      add("$.implementation.items", "must be an array");
    } else {
      let lastRoleOrder = -1;
      const ids = new Set();
      for (const [index, item] of document.implementation.items.entries()) {
        const path = `$.implementation.items[${index}]`;
        if (!isObject(item)) {
          add(path, "must be an object");
          continue;
        }
        for (const field of ["list_item_id", "label", "placement"]) {
          requireString(`${path}.${field}`, item[field]);
        }
        if (ids.has(item.list_item_id)) add(`${path}.list_item_id`, "must be unique");
        ids.add(item.list_item_id);
        if (!SOURCE_ROLE_ORDER.has(item.source_role)) {
          add(`${path}.source_role`, "has an unsupported value");
        } else {
          const order = SOURCE_ROLE_ORDER.get(item.source_role);
          if (order < lastRoleOrder) add(path, "violates required source_role ordering");
          lastRoleOrder = Math.max(lastRoleOrder, order);
        }
        if (!MATCH_TYPES.has(item.match_type)) {
          add(`${path}.match_type`, "has an unsupported value");
        }
        if (!Number.isInteger(item.quantity) || item.quantity < 1) {
          add(`${path}.quantity`, "must be a positive integer");
        }
        const hasCommerceFacts = COMMERCE_FIELDS.some((field) => Object.hasOwn(item, field));
        if (hasCommerceFacts || item.match_type === "exact") {
          const evidence = item.catalog_evidence;
          if (!isObject(evidence)) {
            add(`${path}.catalog_evidence`, "is required for product facts or an exact match");
          } else {
            requireString(`${path}.catalog_evidence.provider`, evidence.provider);
            requireString(`${path}.catalog_evidence.checked_at`, evidence.checked_at);
          }
        }
      }
    }
  }

  if (!Array.isArray(document.notices)) {
    add("$.notices", "must be an array");
  } else {
    for (const [index, notice] of document.notices.entries()) {
      const path = `$.notices[${index}]`;
      if (!isObject(notice)) {
        add(path, "must be an object");
        continue;
      }
      requireString(`${path}.code`, notice.code);
      requireString(`${path}.message`, notice.message);
      if (!["info", "warning", "error"].includes(notice.level)) {
        add(`${path}.level`, "has an unsupported value");
      }
    }
  }
  return errors;
}

async function main() {
  const input = process.argv[2];
  if (!input || process.argv.includes("--help")) {
    console.log("Usage: node scripts/validate-renewal-plan.mjs <output.json>");
    process.exit(input ? 0 : 2);
  }

  const path = resolve(input);
  let document;
  try {
    document = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    console.error(`Cannot read valid JSON from ${path}: ${error.message}`);
    process.exit(2);
  }

  const errors = validate(document);
  if (errors.length > 0) {
    console.error(`Validation failed with ${errors.length} error(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Valid corner-renewal/1.0 artifact: ${path}`);
}

await main();
