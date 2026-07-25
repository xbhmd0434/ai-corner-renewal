import { readFileSync } from "node:fs";
import { V1_ROUTE_MANIFEST } from "./v1-route-manifest.js";

const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));
const schemaRef = (name) => ({ $ref: `#/components/schemas/${name}` });
const responseRef = (name) => ({ $ref: `#/components/responses/${name}` });
const parameterRef = (name) => ({ $ref: `#/components/parameters/${name}` });
const headerRef = (name) => ({ $ref: `#/components/headers/${name}` });

function rewriteRefs(value, prefix = "#/components/schemas/") {
  if (Array.isArray(value)) return value.map((item) => rewriteRefs(item, prefix));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "$ref" && typeof item === "string" && item.startsWith("#/$defs/")
        ? `${prefix}${item.slice("#/$defs/".length)}`
        : rewriteRefs(item, prefix)
    ])
  );
}

const stringArray = (maxItems = 20) => ({
  type: "array",
  maxItems,
  uniqueItems: true,
  items: { type: "string", minLength: 1 }
});

const nullableIdentifier = {
  oneOf: [schemaRef("Identifier"), { type: "null" }]
};

const REQUEST_SCHEMAS = {
  CreateAssetRequest: {
    type: "object",
    additionalProperties: false,
    required: [
      "schema_version",
      "asset_type",
      "lifecycle",
      "media_ids",
      "provenance"
    ],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      asset_type: { enum: ["space", "inspiration", "item"] },
      lifecycle: { enum: ["temporary", "saved"] },
      media_ids: {
        type: "array",
        uniqueItems: true,
        items: schemaRef("Identifier")
      },
      provenance: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["kind"],
            properties: { kind: { const: "upload" } }
          },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "kind",
              "provider",
              "external_content_id",
              "timestamp_ms"
            ],
            properties: {
              kind: { const: "video_context" },
              provider: { type: "string", minLength: 1 },
              external_content_id: { type: "string", minLength: 1 },
              author_display: { type: "string" },
              timestamp_ms: { type: "integer", minimum: 0 },
              selection_bbox: schemaRef("BBox")
            }
          }
        ]
      },
      attributes: {
        type: "object",
        description:
          "按 asset_type 使用白名单字段；身份、解析事实和商品事实不能由客户端写入。"
      }
    },
    examples: [
      {
        schema_version: "1.0",
        asset_type: "space",
        lifecycle: "saved",
        media_ids: ["media-example"],
        provenance: { kind: "upload" },
        attributes: {
          name: "我的书桌",
          scene_type: "study_corner",
          default_budget_cny: 500
        }
      }
    ]
  },
  AssetPatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "resource_version", "changes"],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      resource_version: { type: "integer", minimum: 1 },
      changes: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
          lifecycle: { enum: ["temporary", "saved", "archived"] },
          is_default: { type: "boolean" },
          tags: stringArray(20),
          attributes: { type: "object" }
        }
      }
    }
  },
  ParseRetryRequest: {
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "reason"],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      reason: { const: "user_retry" },
      space_version_id: nullableIdentifier
    }
  },
  CreateSpaceVersionRequest: {
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "media_ids"],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      parent_space_version_id: nullableIdentifier,
      media_ids: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: schemaRef("Identifier")
      },
      reference_width_cm: { type: "integer", minimum: 40, maximum: 400 }
    }
  },
  SealSpaceVersionRequest: {
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "resource_version", "changes"],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      resource_version: { type: "integer", minimum: 1 },
      changes: {
        type: "object",
        additionalProperties: false,
        properties: {
          reference_width_cm: {
            type: "integer",
            minimum: 40,
            maximum: 400
          },
          editable_region_id: schemaRef("Identifier"),
          detected_object_confirmations: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["detected_object_id", "disposition"],
              properties: {
                detected_object_id: schemaRef("Identifier"),
                disposition: { enum: ["keep", "movable", "removable"] }
              }
            }
          },
          seal: { type: "boolean" }
        }
      }
    }
  },
  CreateDesignRequest: {
    type: "object",
    additionalProperties: false,
    required: [
      "schema_version",
      "trigger",
      "space_asset_id",
      "space_version_id",
      "reference_asset_ids",
      "goal_codes",
      "constraints"
    ],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      trigger: {
        enum: ["video_apply", "space_upload", "space_reuse", "asset_detail"]
      },
      space_asset_id: schemaRef("Identifier"),
      space_version_id: schemaRef("Identifier"),
      reference_asset_ids: {
        type: "array",
        maxItems: 3,
        uniqueItems: true,
        items: schemaRef("Identifier")
      },
      goal: { type: "string", minLength: 1, maxLength: 500 },
      goal_codes: {
        type: "array",
        maxItems: 5,
        uniqueItems: true,
        items: {
          enum: [
            "organization",
            "ambient_lighting",
            "study_focus",
            "low_budget",
            "reuse_existing"
          ]
        }
      },
      constraints: {
        type: "object",
        additionalProperties: false,
        properties: {
          budget_cny: { type: "integer", minimum: 1, maximum: 1000000 },
          no_drilling: { type: "boolean" },
          keep_detected_object_ids: {
            type: "array",
            maxItems: 64,
            uniqueItems: true,
            items: schemaRef("Identifier")
          },
          pet_context: { enum: ["none", "cat", "dog", "other"] }
        }
      },
      editable_region_id: schemaRef("Identifier"),
      options: {
        type: "object",
        additionalProperties: false,
        properties: {
          analysis_mode: { enum: ["auto", "demo", "live"] },
          include_trace: { type: "boolean" }
        }
      }
    },
    examples: [
      {
        schema_version: "1.0",
        trigger: "space_reuse",
        space_asset_id: "space-demo-desk",
        space_version_id: "space-demo-desk-v1",
        reference_asset_ids: [],
        goal: "保留书桌，只整理并增加暖光",
        goal_codes: ["organization", "ambient_lighting"],
        constraints: {
          budget_cny: 500,
          no_drilling: true,
          keep_detected_object_ids: ["detected-space-demo-desk-desk"],
          pet_context: "none"
        },
        editable_region_id: "desktop-and-back-wall",
        options: { analysis_mode: "auto", include_trace: false }
      }
    ]
  },
  CreateGenerationRun: {
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "reason"],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      reason: { enum: ["initial", "retry"] },
      retry_of_generation_run_id: schemaRef("Identifier")
    }
  },
  CreatePlanRevision: {
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "parent_plan_version_id", "action"],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      parent_plan_version_id: schemaRef("Identifier"),
      action: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "target_budget_cny"],
            properties: {
              type: { const: "reduce_budget" },
              target_budget_cny: { type: "integer", minimum: 1 }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "style_key", "reference_asset_ids"],
            properties: {
              type: { const: "change_style" },
              style_key: { enum: ["warm", "compact", "green"] },
              reference_asset_ids: {
                type: "array",
                maxItems: 3,
                uniqueItems: true,
                items: schemaRef("Identifier")
              }
            }
          }
        ]
      }
    }
  },
  PlanPatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "resource_version", "changes"],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      resource_version: { type: "integer", minimum: 1 },
      changes: {
        type: "object",
        additionalProperties: false,
        properties: {
          lifecycle: { enum: ["draft", "saved", "archived"] },
          decision_state: {
            enum: ["undecided", "selected", "executing", "completed"]
          }
        }
      }
    }
  },
  PreferencePatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "resource_version", "changes"],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      resource_version: { type: "integer", minimum: 1 },
      changes: {
        type: "object",
        additionalProperties: false,
        properties: {
          styles: stringArray(20),
          colors: stringArray(20),
          materials: stringArray(20),
          default_budget_cny: {
            type: "integer",
            minimum: 1,
            maximum: 1000000
          },
          stable_constraints: stringArray(20),
          disliked_elements: stringArray(20),
          personalization_enabled: { type: "boolean" },
          reset: { type: "boolean" }
        }
      }
    }
  },
  EventBatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "events"],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      events: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["event_name", "event_id"],
          properties: {
            event_name: {
              enum: [
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
                "product_discovery_section_viewed",
                "product_discovery_retry_requested",
                "commerce_match_clicked",
                "commerce_search_copied",
                "commerce_action_unavailable"
              ]
            },
            event_id: { type: "string", minLength: 1, maxLength: 100 },
            client_time: { type: "string", format: "date-time" },
            entry: {
              type: "string",
              maxLength: 64,
              pattern: "^[a-z][a-z0-9_]*$"
            },
            entity_ids: { type: "object" },
            attributes: { type: "object" }
          }
        }
      }
    }
  },
  CreateProductDiscoveryRunRequest: {
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "reason"],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      reason: { enum: ["initial", "retry", "refresh"] },
      retry_of_product_discovery_run_id: schemaRef("Identifier"),
      options: {
        type: "object",
        additionalProperties: false,
        properties: {
          discovery_mode: { enum: ["auto", "live", "demo"] },
          max_subjects: { type: "integer", minimum: 1, maximum: 8 },
          matches_per_subject: { type: "integer", minimum: 1, maximum: 5 }
        }
      }
    }
  }
};

const RESPONSE_SCHEMAS = {
  AssetList: {
    type: "object",
    required: ["schema_version", "items", "next_cursor", "total"],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      items: { type: "array", items: schemaRef("Asset") },
      next_cursor: { type: ["string", "null"] },
      total: { type: "integer", minimum: 0 }
    }
  },
  SpaceVersionList: {
    type: "object",
    required: ["schema_version", "items"],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      items: { type: "array", items: schemaRef("SpaceVersionSummary") }
    }
  },
  SpaceVersionSummary: {
    type: "object",
    required: [
      "space_version_id",
      "parent_space_version_id",
      "state",
      "parse_state",
      "resource_version",
      "related_plan_count",
      "created_at",
      "updated_at"
    ],
    properties: {
      space_version_id: schemaRef("Identifier"),
      parent_space_version_id: nullableIdentifier,
      state: { enum: ["draft", "sealed"] },
      parse_state: {
        enum: ["queued", "parsing", "needs_confirmation", "ready", "failed"]
      },
      resource_version: { type: "integer", minimum: 1 },
      reference_width_cm: { type: ["integer", "null"], minimum: 40, maximum: 400 },
      related_plan_count: { type: "integer", minimum: 0 },
      created_at: schemaRef("Timestamp"),
      updated_at: schemaRef("Timestamp")
    }
  },
  PlanList: {
    type: "object",
    required: ["schema_version", "items", "next_cursor", "total"],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      items: { type: "array", items: { type: "object" } },
      next_cursor: { type: ["string", "null"] },
      total: { type: "integer", minimum: 0 }
    }
  },
  PlanDetail: {
    type: "object",
    required: [
      "schema_version",
      "plan_asset_id",
      "current_plan_version_id",
      "resource_version",
      "versions"
    ],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      plan_asset_id: schemaRef("Identifier"),
      current_plan_version_id: schemaRef("Identifier"),
      resource_version: { type: "integer", minimum: 1 },
      lifecycle: { enum: ["draft", "saved", "archived"] },
      decision_state: {
        enum: ["undecided", "selected", "executing", "completed"]
      },
      versions: { type: "array", items: { type: "object" } }
    }
  },
  PlanResource: {
    type: "object",
    required: [
      "schema_version",
      "plan_asset_id",
      "resource_version",
      "lifecycle",
      "decision_state",
      "current_plan_version_id"
    ],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      plan_asset_id: schemaRef("Identifier"),
      resource_version: { type: "integer", minimum: 1 },
      lifecycle: { enum: ["draft", "saved", "archived"] },
      decision_state: {
        enum: ["undecided", "selected", "executing", "completed"]
      },
      current_plan_version_id: schemaRef("Identifier"),
      updated_at: schemaRef("Timestamp")
    }
  },
  PlanRevisionAccepted: {
    type: "object",
    required: [
      "schema_version",
      "plan_asset_id",
      "parent_plan_version_id",
      "design_request_id",
      "generation_run_id",
      "status"
    ],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      plan_asset_id: schemaRef("Identifier"),
      parent_plan_version_id: schemaRef("Identifier"),
      design_request_id: schemaRef("Identifier"),
      generation_run_id: schemaRef("Identifier"),
      status: { const: "queued" }
    }
  },
  ErrorEnvelope: {
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "request_id", "error"],
    properties: {
      schema_version: schemaRef("SchemaVersion"),
      request_id: schemaRef("Identifier"),
      error: {
        type: "object",
        required: ["code", "message", "retryable"],
        properties: {
          code: { type: "string", minLength: 1 },
          message: { type: "string", minLength: 1 },
          retryable: { type: "boolean" },
          issues: { type: "array", items: { type: "object" } },
          details: { type: "object" }
        }
      }
    }
  }
};

const query = (name, schema, description) => ({
  name,
  in: "query",
  required: false,
  schema,
  description
});

const ASSET_QUERIES = [
  query("asset_type", { enum: ["space", "inspiration", "item"] }, "资产类型"),
  query(
    "lifecycle",
    { enum: ["temporary", "saved", "archived"] },
    "生命周期"
  ),
  query(
    "parse_state",
    {
      enum: ["queued", "parsing", "needs_confirmation", "ready", "failed"]
    },
    "解析状态"
  ),
  query("sort", { enum: ["recent", "match"] }, "排序方式"),
  query(
    "compatible_with_asset_id",
    { type: "string" },
    "返回与指定资产兼容的候选并附匹配理由"
  ),
  query("cursor", { type: "string" }, "不透明分页游标"),
  query("limit", { type: "integer", minimum: 1, maximum: 100 }, "分页大小")
];

const PRODUCT_DISCOVERY_LIST_QUERIES = [
  query("sort", { enum: ["recent"] }, "当前只支持 recent"),
  query("cursor", { type: "string" }, "不透明分页游标"),
  query("limit", { type: "integer", minimum: 1, maximum: 100 }, "分页大小")
];

const PLAN_QUERIES = [
  query("space_asset_id", { type: "string" }, "按空间资产筛选"),
  query("lifecycle", { enum: ["draft", "saved", "archived"] }, "生命周期"),
  query(
    "decision_state",
    { enum: ["undecided", "selected", "executing", "completed"] },
    "用户决策状态"
  ),
  query("sort", { const: "recent" }, "当前只支持 recent"),
  query("cursor", { type: "string" }, "不透明分页游标"),
  query("limit", { type: "integer", minimum: 1, maximum: 100 }, "分页大小")
];

const OPERATIONS = {
  createMedia: {
    tag: "Media",
    summary: "上传私有图片媒体",
    requestBody: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["file", "purpose"],
            properties: {
              file: { type: "string", format: "binary" },
              purpose: {
                enum: [
                  "space_source",
                  "reference_source",
                  "generated_render"
                ]
              },
              retention: { const: "temporary", default: "temporary" }
            }
          }
        }
      }
    },
    success: ["201", "媒体已校验、去元数据并写入私有存储", "MediaObject"]
  },
  getMediaContent: {
    tag: "Media",
    summary: "使用短时签名读取私有媒体",
    parameters: [
      {
        name: "token",
        in: "query",
        required: true,
        schema: { type: "string", minLength: 16 },
        description: "由媒体 access.url 返回的短时签名"
      }
    ],
    binary: true
  },
  deleteMedia: {
    tag: "Media",
    summary: "删除尚未绑定资产的媒体",
    noContent: true
  },
  createAsset: {
    tag: "Assets",
    summary: "创建空间、灵感或单品资产",
    body: "CreateAssetRequest",
    successes: [
      ["200", "命中同一 actor 的去重资产", "Asset"],
      ["201", "资产已创建并排队解析", "Asset"]
    ]
  },
  listAssets: {
    tag: "Assets",
    summary: "筛选和分页读取资产",
    parameters: ASSET_QUERIES,
    success: ["200", "资产列表", "AssetList"]
  },
  createAssetParseRun: {
    tag: "Assets",
    summary: "重试失败的资产解析",
    body: "ParseRetryRequest",
    success: ["202", "解析任务已排队", null]
  },
  createSpaceVersion: {
    tag: "Space versions",
    summary: "为已有空间创建新的不可变版本草稿",
    body: "CreateSpaceVersionRequest",
    success: ["201", "空间版本已创建并排队解析", "SpaceVersion"]
  },
  listSpaceVersions: {
    tag: "Space versions",
    summary: "读取空间的版本历史",
    success: ["200", "空间版本列表", "SpaceVersionList"]
  },
  sealSpaceVersion: {
    tag: "Space versions",
    summary: "确认解析事实并封存空间版本",
    body: "SealSpaceVersionRequest",
    success: ["200", "空间版本已更新", "SpaceVersion"],
    etag: true
  },
  getAsset: {
    tag: "Assets",
    summary: "读取资产详情、当前空间版本和预览地址",
    success: ["200", "资产详情", "Asset"],
    etag: true
  },
  updateAsset: {
    tag: "Assets",
    summary: "按 resource_version 更新资产",
    body: "AssetPatchRequest",
    success: ["200", "资产已更新", "Asset"],
    etag: true
  },
  deleteAsset: {
    tag: "Assets",
    summary: "删除资产并执行受控级联清理",
    noContent: true
  },
  createDesignRequest: {
    tag: "Design requests",
    summary: "冻结设计输入快照",
    body: "CreateDesignRequest",
    success: ["201", "不可变 DesignRequest 已创建", "DesignRequest"]
  },
  getDesignRequest: {
    tag: "Design requests",
    summary: "读取设计输入快照及运行历史",
    success: ["200", "DesignRequest 详情", null]
  },
  createGenerationRun: {
    tag: "Generation runs",
    summary: "开始或重试一次生成运行",
    body: "CreateGenerationRun",
    success: ["202", "运行已排队", "GenerationRun"]
  },
  getGenerationRun: {
    tag: "Generation runs",
    summary: "轮询运行阶段、进度、待补信息和结果",
    success: ["200", "运行快照", "GenerationRun"]
  },
  cancelGenerationRun: {
    tag: "Generation runs",
    summary: "取消 queued 或 running 的运行",
    success: ["200", "运行已取消", "GenerationRun"]
  },
  listPlans: {
    tag: "Plans",
    summary: "筛选和分页读取方案谱系",
    parameters: PLAN_QUERIES,
    success: ["200", "方案列表", "PlanList"]
  },
  getPlanVersion: {
    tag: "Plans",
    summary: "读取不可变方案版本与 AICard",
    success: ["200", "方案版本", "PlanVersionEnvelope"]
  },
  createPlanRevision: {
    tag: "Plans",
    summary: "创建降预算或换风格的派生运行",
    body: "CreatePlanRevision",
    success: ["202", "调整运行已排队", "PlanRevisionAccepted"]
  },
  getPlan: {
    tag: "Plans",
    summary: "读取方案谱系和版本摘要",
    success: ["200", "方案详情", "PlanDetail"],
    etag: true
  },
  updatePlan: {
    tag: "Plans",
    summary: "更新方案生命周期或用户决策状态",
    body: "PlanPatchRequest",
    success: ["200", "方案已更新", "PlanResource"],
    etag: true
  },
  getPreferences: {
    tag: "Preferences",
    summary: "读取当前显式偏好",
    success: ["200", "显式偏好", "Preference"],
    etag: true
  },
  updatePreferences: {
    tag: "Preferences",
    summary: "按 resource_version 更新、暂停或重置显式偏好",
    body: "PreferencePatchRequest",
    success: ["200", "偏好已更新", "Preference"],
    etag: true
  },
  createEventBatch: {
    tag: "Events",
    summary: "批量写入白名单产品事件",
    body: "EventBatchRequest",
    success: ["202", "事件批次已处理", "EventBatchResult"]
  },
  createProductDiscoveryRun: {
    tag: "Product Discovery",
    summary: "创建商品发现运行（initial/retry/refresh）",
    body: "CreateProductDiscoveryRunRequest",
    success: ["202", "运行已排队", "ProductDiscoveryRun"]
  },
  listProductDiscoveryRuns: {
    tag: "Product Discovery",
    summary: "列出某方案版本的商品发现运行历史",
    parameters: PRODUCT_DISCOVERY_LIST_QUERIES,
    success: ["200", "运行列表", "ProductDiscoveryRunList"]
  },
  getProductDiscoveryRun: {
    tag: "Product Discovery",
    summary: "查询单次商品发现运行的状态与结果",
    success: ["200", "运行快照", "ProductDiscoveryRun"]
  },
  cancelProductDiscoveryRun: {
    tag: "Product Discovery",
    summary: "取消 queued 或 running 的商品发现运行",
    success: ["200", "运行已取消", "ProductDiscoveryRun"]
  }
};

function pathParameters(template) {
  return [...template.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: schemaRef("Identifier")
  }));
}

function jsonRequestBody(schemaName) {
  return {
    required: true,
    content: {
      "application/json": {
        schema: schemaRef(schemaName)
      }
    }
  };
}

function jsonSuccess(description, schemaName, etag = false) {
  return {
    description,
    headers: {
      "X-Request-Id": headerRef("RequestId"),
      ...(etag ? { ETag: headerRef("ETag") } : {})
    },
    content: {
      "application/json": {
        schema: schemaName ? schemaRef(schemaName) : { type: "object" }
      }
    }
  };
}

const COMMON_ERRORS = {
  "400": responseRef("BadRequest"),
  "403": responseRef("Forbidden"),
  "404": responseRef("NotFound"),
  "405": responseRef("MethodNotAllowed"),
  "409": responseRef("Conflict"),
  "413": responseRef("PayloadTooLarge"),
  "415": responseRef("UnsupportedMediaType"),
  "422": responseRef("ValidationError"),
  "500": responseRef("InternalError")
};

function buildOperation(route) {
  const definition = OPERATIONS[route.operationId];
  if (!definition) {
    throw new Error(`OpenAPI 缺少 operation ${route.operationId}`);
  }
  const parameters = [
    ...pathParameters(route.template),
    ...(route.idempotent ? [parameterRef("IdempotencyKey")] : []),
    ...(definition.parameters || [])
  ];
  const responses = { ...COMMON_ERRORS };
  if (definition.noContent) {
    responses["204"] = {
      description: "操作成功，无响应体",
      headers: { "X-Request-Id": headerRef("RequestId") }
    };
  } else if (definition.binary) {
    responses["200"] = {
      description: "私有图片字节",
      headers: { "X-Request-Id": headerRef("RequestId") },
      content: {
        "image/jpeg": { schema: { type: "string", format: "binary" } },
        "image/png": { schema: { type: "string", format: "binary" } },
        "image/webp": { schema: { type: "string", format: "binary" } }
      }
    };
  } else {
    for (const [status, description, schemaName] of
      definition.successes || [definition.success]) {
      responses[status] = jsonSuccess(description, schemaName, definition.etag);
    }
  }
  return {
    operationId: route.operationId,
    tags: [definition.tag],
    summary: definition.summary,
    parameters,
    ...(definition.requestBody
      ? { requestBody: definition.requestBody }
      : definition.body
        ? { requestBody: jsonRequestBody(definition.body) }
        : {}),
    responses
  };
}

function buildPaths() {
  const paths = {};
  for (const route of V1_ROUTE_MANIFEST) {
    paths[route.template] ||= {};
    paths[route.template][route.method.toLowerCase()] = buildOperation(route);
  }
  paths["/api/health"] = {
    get: {
      operationId: "getHealth",
      tags: ["System"],
      summary: "读取服务模式、能力和限制",
      responses: {
        "200": jsonSuccess("服务健康状态", null),
        "403": responseRef("Forbidden"),
        "500": responseRef("InternalError")
      }
    }
  };
  paths["/api/openapi.json"] = {
    get: {
      operationId: "getOpenApiDocument",
      tags: ["System"],
      summary: "读取当前可导入的 OpenAPI 3.1 契约",
      responses: {
        "200": {
          description: "OpenAPI 3.1 JSON 文档",
          headers: { "X-Request-Id": headerRef("RequestId") },
          content: {
            "application/json": {
              schema: { type: "object" }
            }
          }
        },
        "403": responseRef("Forbidden"),
        "500": responseRef("InternalError")
      }
    }
  };
  return paths;
}

function generationRunExamples() {
  const base = {
    schema_version: "1.0",
    generation_run_id: "generation-run-example",
    design_request_id: "design-request-example",
    phase_index: 1,
    phase_total: 9,
    source_mode: null,
    retryable: false,
    needs_input: null,
    result: null,
    error: null,
    created_at: "2026-07-25T12:00:00.000Z",
    updated_at: "2026-07-25T12:00:00.000Z"
  };
  return [
    {
      ...base,
      status: "queued",
      phase: "input_validation",
      progress: 0
    },
    {
      ...base,
      status: "succeeded",
      phase: "packaging",
      phase_index: 9,
      progress: 100,
      source_mode: "fallback",
      result: { plan_asset_id: "plan-example", plan_version: {} }
    },
    {
      ...base,
      status: "succeeded",
      phase: "packaging",
      phase_index: 9,
      progress: 100,
      source_mode: "demo",
      needs_input: {
        reason_code: "missing_reference_width",
        question: "请补充桌面宽度，购买前才能完成尺寸复核。",
        required_fields: ["room_input.reference_width_cm"],
        can_continue_with_assumptions: true,
        has_preview: true
      },
      result: { plan_asset_id: "plan-example", plan_version: {} }
    },
    {
      ...base,
      status: "cancelled",
      phase: "space_analysis",
      phase_index: 2,
      progress: 22
    },
    {
      ...base,
      status: "failed",
      phase: "rendering",
      phase_index: 7,
      progress: 78,
      source_mode: "live",
      retryable: true,
      error: {
        code: "render_provider_timeout",
        message: "方案生成未完成，可以重试",
        retryable: true
      }
    }
  ];
}

export function createOpenApiDocument() {
  const platformSchema = readJson(
    new URL("../schemas/platform-v1.schema.json", import.meta.url)
  );
  const aicardSchema = readJson(
    new URL("../schemas/aicard-v1.schema.json", import.meta.url)
  );
  const schemas = {
    ...Object.fromEntries(
      Object.entries(platformSchema.$defs).map(([name, schema]) => [
        name,
        rewriteRefs(schema)
      ])
    ),
    AICard: rewriteRefs(
      aicardSchema,
      "#/components/schemas/AICard/$defs/"
    ),
    ...REQUEST_SCHEMAS,
    ...RESPONSE_SCHEMAS
  };
  schemas.GenerationRun.examples = generationRunExamples();

  return {
    openapi: "3.1.0",
    info: {
      title: "AI 一角焕新 Orchestrator API",
      version: "0.5.2",
      description:
        "比赛 P0 可持久联调契约。当前使用服务端固定 Demo actor，不是生产级公网鉴权或多租户 API。"
    },
    servers: [
      {
        url: "http://127.0.0.1:8787",
        description: "本地 Orchestrator"
      },
      {
        url: "http://127.0.0.1:8765",
        description: "抖音 Demo 同源代理"
      }
    ],
    tags: [
      { name: "System" },
      { name: "Media" },
      { name: "Assets" },
      { name: "Space versions" },
      { name: "Design requests" },
      { name: "Generation runs" },
      { name: "Plans" },
      { name: "Preferences" },
      { name: "Events" },
      { name: "Product Discovery" }
    ],
    paths: buildPaths(),
    components: {
      parameters: {
        IdempotencyKey: {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          description:
            "8～200 字符；同一路由重放相同请求，复用到不同请求返回 409。",
          schema: {
            type: "string",
            minLength: 8,
            maxLength: 200,
            pattern: "^[A-Za-z0-9._:-]+$"
          }
        }
      },
      headers: {
        RequestId: {
          description: "服务端日志关联 ID",
          schema: { type: "string" }
        },
        ETag: {
          description: "当前 resource_version 的弱并发提示",
          schema: { type: "string" }
        }
      },
      responses: {
        BadRequest: {
          description: "请求目标、JSON 或 multipart 结构非法",
          content: {
            "application/json": { schema: schemaRef("ErrorEnvelope") }
          }
        },
        Forbidden: {
          description: "浏览器 Origin 或资源访问被拒绝",
          content: {
            "application/json": { schema: schemaRef("ErrorEnvelope") }
          }
        },
        NotFound: {
          description: "资源或路由不存在",
          content: {
            "application/json": { schema: schemaRef("ErrorEnvelope") }
          }
        },
        MethodNotAllowed: {
          description: "路径存在，但当前 HTTP 方法不受支持",
          headers: {
            Allow: {
              description: "该路径允许的方法",
              schema: { type: "string" }
            },
            "X-Request-Id": headerRef("RequestId")
          },
          content: {
            "application/json": { schema: schemaRef("ErrorEnvelope") }
          }
        },
        Conflict: {
          description: "幂等、状态机、版本或并发冲突",
          content: {
            "application/json": { schema: schemaRef("ErrorEnvelope") }
          }
        },
        PayloadTooLarge: {
          description: "请求体或上传文件超过健康接口公布的限制",
          content: {
            "application/json": { schema: schemaRef("ErrorEnvelope") }
          }
        },
        UnsupportedMediaType: {
          description: "Content-Type 不受支持",
          content: {
            "application/json": { schema: schemaRef("ErrorEnvelope") }
          }
        },
        ValidationError: {
          description: "字段、业务约束或 Idempotency-Key 校验失败",
          content: {
            "application/json": { schema: schemaRef("ErrorEnvelope") }
          }
        },
        InternalError: {
          description: "内部错误；响应不会暴露供应商正文、Prompt 或密钥",
          content: {
            "application/json": { schema: schemaRef("ErrorEnvelope") }
          }
        }
      },
      schemas
    },
    "x-auth-mode": "demo_fixed_actor",
    "x-contract-version": "1.0"
  };
}
