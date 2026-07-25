import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { createRoomAnalyzer } from "../src/adapters/room-analyzer.js";
import { defaultRoomProfile } from "../src/data/demo-catalog.js";

function makeRoomInput(overrides = {}) {
  return {
    room_id: "room-requested",
    image: {
      reference: "client://room-image",
      media_type: "image/png"
    },
    reference_width_cm: 120,
    quality_hint: "clear",
    ...overrides
  };
}

function makeLiveProfile(roomId = "room-requested") {
  return {
    room_id: roomId,
    room_type: "desk_corner",
    reference_width_cm: 120,
    fixed_elements: ["wall", "desk", "chair"],
    editable_zones: ["desktop", "desktop_back"],
    lighting: {
      direction: "left",
      confidence: 0.9
    },
    uncertainties: [],
    needs_confirmation: []
  };
}

test("global demo mode cannot be overridden by a client live request", async () => {
  let fetchCalls = 0;
  const analyze = createRoomAnalyzer({
    config: loadConfig({
      AI_BACKEND_MODE: "demo",
      ROOM_ANALYZER_URL: "https://analyzer.example/v1/room"
    }),
    defaultRoomProfile,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("must not be called");
    }
  });

  const result = await analyze(makeRoomInput(), "live");
  assert.equal(fetchCalls, 0);
  assert.equal(result.sourceMode, "demo");
  assert.equal(result.roomProfile.room_id, "room-requested");
});

test("live request forbids redirects and sends only the room input allowlist", async () => {
  let receivedOptions;
  const analyze = createRoomAnalyzer({
    config: loadConfig({
      AI_BACKEND_MODE: "live",
      ROOM_ANALYZER_URL: "https://analyzer.example/v1/room",
      ROOM_ANALYZER_API_KEY: "secret"
    }),
    defaultRoomProfile,
    fetchImpl: async (_url, options) => {
      receivedOptions = options;
      return new Response(
        JSON.stringify({ room_profile: makeLiveProfile() }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
  });

  const input = makeRoomInput({
    image: {
      reference: "client://room-image",
      media_type: "image/png",
      internal_note: "do not forward"
    },
    internal_note: "do not forward"
  });
  const result = await analyze(input, "live");
  const outbound = JSON.parse(receivedOptions.body);

  assert.equal(result.sourceMode, "live");
  assert.equal(receivedOptions.redirect, "error");
  assert.equal(receivedOptions.headers.Authorization, "Bearer secret");
  assert.deepEqual(outbound.room_input, {
    room_id: "room-requested",
    image: {
      reference: "client://room-image",
      media_type: "image/png"
    },
    reference_width_cm: 120,
    quality_hint: "clear"
  });
});

test("a mismatched upstream room id falls back with an explicit reason", async () => {
  const analyze = createRoomAnalyzer({
    config: loadConfig({
      AI_BACKEND_MODE: "live",
      ROOM_ANALYZER_URL: "https://analyzer.example/v1/room"
    }),
    defaultRoomProfile,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ room_profile: makeLiveProfile("other-room") }),
        { status: 200 }
      )
  });

  const first = await analyze(makeRoomInput(), "live");
  const second = await analyze(makeRoomInput(), "live");

  assert.equal(first.sourceMode, "fallback");
  assert.equal(first.fallback.reason, "upstream_room_mismatch");
  assert.equal(first.roomProfile.room_id, "room-requested");
  assert.deepEqual(first.roomProfile, second.roomProfile);
});

test("an oversized streaming upstream response is cancelled and falls back", async () => {
  const analyze = createRoomAnalyzer({
    config: loadConfig({
      AI_BACKEND_MODE: "live",
      ROOM_ANALYZER_URL: "https://analyzer.example/v1/room",
      ROOM_ANALYZER_RESPONSE_LIMIT_BYTES: "1024"
    }),
    defaultRoomProfile,
    fetchImpl: async () => new Response("x".repeat(1025), { status: 200 })
  });

  const result = await analyze(makeRoomInput(), "live");
  assert.equal(result.sourceMode, "fallback");
  assert.equal(result.fallback.reason, "upstream_response_too_large");
});

test("Agent Plan sends an OpenAI-compatible multimodal request and owns stable identity locally", async () => {
  let requestedUrl;
  let receivedOptions;
  const analyze = createRoomAnalyzer({
    config: loadConfig({
      AI_BACKEND_MODE: "live",
      AGENT_PLAN_API_KEY: "secret",
      AGENT_PLAN_TEXT_MODEL: "doubao-seed-2.0-lite"
    }),
    defaultRoomProfile,
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      receivedOptions = options;
      return new Response(
        JSON.stringify({
          model: "doubao-seed-2.0-lite",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  room_type: "desk_corner",
                  fixed_elements: ["wall", "desk", "chair"],
                  editable_zones: ["desktop", "desktop_back"],
                  lighting: { direction: "left", confidence: 0.88 },
                  uncertainties: [],
                  needs_confirmation: []
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
  });

  const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
  const result = await analyze(
    makeRoomInput({
      room_id: "stable-room-id",
      image: { data_url: dataUrl, media_type: "image/png" }
    }),
    "live"
  );
  const outbound = JSON.parse(receivedOptions.body);

  assert.equal(
    requestedUrl,
    "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions"
  );
  assert.equal(receivedOptions.headers.Authorization, "Bearer secret");
  assert.equal(receivedOptions.redirect, "error");
  assert.equal(outbound.model, "doubao-seed-2.0-lite");
  assert.equal(outbound.messages[0].content[0].image_url.url, dataUrl);
  assert.doesNotMatch(receivedOptions.body, /stable-room-id|Bearer secret/);
  assert.equal(result.sourceMode, "live");
  assert.equal(result.roomProfile.room_id, "stable-room-id");
  assert.equal(result.roomProfile.reference_width_cm, 120);
});

test("Agent Plan free-form visual labels are reduced to the planning ontology", async () => {
  const analyze = createRoomAnalyzer({
    config: loadConfig({
      AI_BACKEND_MODE: "live",
      AGENT_PLAN_API_KEY: "secret"
    }),
    defaultRoomProfile,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  room_type: "卧室",
                  fixed_elements: [
                    "左侧深色框窗户",
                    "浅色墙面",
                    "木地板",
                    "书桌",
                    "椅子"
                  ],
                  editable_zones: [
                    "桌面物品摆放区",
                    "书桌下方空间",
                    "右侧空白墙面"
                  ],
                  lighting: { direction: "左侧", confidence: 0.96 },
                  uncertainties: [],
                  needs_confirmation: []
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
  });

  const result = await analyze(
    makeRoomInput({
      image: {
        data_url: "data:image/png;base64,iVBORw0KGgo=",
        media_type: "image/png"
      }
    }),
    "live"
  );

  assert.equal(result.sourceMode, "live");
  assert.deepEqual(result.roomProfile.fixed_elements, [
    "window",
    "wall",
    "desk",
    "chair"
  ]);
  assert.deepEqual(result.roomProfile.editable_zones, [
    "desktop",
    "underdesk_right",
    "wall_leaning_zone"
  ]);
  assert.ok(result.roomProfile.uncertainties.includes("unmapped_fixed_elements"));
});

test("Agent Plan rejects non-transferable local references and falls back explicitly", async () => {
  let fetchCalls = 0;
  const analyze = createRoomAnalyzer({
    config: loadConfig({
      AI_BACKEND_MODE: "live",
      AGENT_PLAN_API_KEY: "secret"
    }),
    defaultRoomProfile,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("must not be called");
    }
  });

  const result = await analyze(makeRoomInput(), "live");
  assert.equal(fetchCalls, 0);
  assert.equal(result.sourceMode, "fallback");
  assert.equal(result.fallback.reason, "upstream_image_unavailable");
});

test("Agent Plan authentication failures do not leak response bodies", async () => {
  const analyze = createRoomAnalyzer({
    config: loadConfig({
      AI_BACKEND_MODE: "live",
      AGENT_PLAN_API_KEY: "secret"
    }),
    defaultRoomProfile,
    fetchImpl: async () =>
      new Response("sensitive provider detail", { status: 401 })
  });

  const result = await analyze(
    makeRoomInput({
      image: {
        data_url: "data:image/png;base64,iVBORw0KGgo=",
        media_type: "image/png"
      }
    }),
    "live"
  );
  assert.equal(result.sourceMode, "fallback");
  assert.equal(result.fallback.reason, "upstream_unauthorized");
  assert.doesNotMatch(JSON.stringify(result), /sensitive provider detail/);
});
