import {
  get,
  post,
  generateIdempotencyKey
} from "./http-client.js";
import {
  uploadMedia,
  deleteMedia,
  createAsset,
  getAsset
} from "./v1-client.js";
import { confirmInspirationIntent } from "./intent-confirmation-client.js";

const TERMINAL_STATES = new Set(["succeeded", "failed", "cancelled"]);
const ASSET_TERMINAL_STATES = new Set([
  "needs_confirmation",
  "ready",
  "failed"
]);

function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

export async function waitForInspirationAsset(
  assetId,
  { signal, intervalMs = 350, maxAttempts = 30 } = {}
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const asset = await getAsset(assetId, { signal });
    if (ASSET_TERMINAL_STATES.has(asset.parse_state)) return asset;
    await wait(intervalMs, signal);
  }
  throw new Error("灵感识别超时，请稍后重试");
}

/**
 * 把视频关键帧圈选持久化为 InspirationAsset。
 *
 * 注意：这里故意不创建 ItemAsset、不确认商品候选。视频入口的领域对象是灵感，
 * 商品事实要等效果图确认后由实施清单负责。
 */
export async function createVideoInspiration(
  { cropBlob, sourceContext },
  options = {}
) {
  if (!(cropBlob instanceof Blob) || cropBlob.size === 0) {
    throw new Error("无法读取圈选画面，请重新暂停视频后再试");
  }
  if (!sourceContext?.external_content_id) {
    throw new Error("视频来源信息不完整，请重新进入");
  }

  let mediaId = null;
  let assetCreated = false;
  try {
    const mediaType = cropBlob.type || "image/webp";
    const extension =
      mediaType === "image/png"
        ? "png"
        : mediaType === "image/jpeg"
          ? "jpg"
          : "webp";
    const file = new File([cropBlob], `video-inspiration.${extension}`, {
      type: mediaType
    });
    const media = await uploadMedia(file, {
      purpose: "reference_source",
      retention: "temporary",
      ...options
    });
    mediaId = media.media_id;
    const created = await createAsset(
      {
        schema_version: "1.0",
        asset_type: "inspiration",
        lifecycle: "temporary",
        media_ids: [mediaId],
        provenance: {
          kind: "video_context",
          provider: sourceContext.provider || "douyin_static_demo",
          external_content_id: sourceContext.external_content_id,
          author_display: sourceContext.author_display || "视频作者",
          timestamp_ms: Number.isInteger(sourceContext.timestamp_ms)
            ? sourceContext.timestamp_ms
            : 0,
          selection_bbox: sourceContext.selection_bbox
        },
        attributes: {
          name: String(
            sourceContext.caption || "视频圈选的家居灵感"
          ).slice(0, 100),
          user_note: "来自视频关键帧圈选，等待用户确认组件或风格意图"
        }
      },
      options
    );
    assetCreated = true;
    return await waitForInspirationAsset(created.asset_id, options);
  } catch (error) {
    // 创建资产成功后媒体已由资产拥有，不能由前端单独删除。
    if (mediaId && !assetCreated) {
      deleteMedia(mediaId).catch(() => {});
    }
    throw error;
  }
}

export async function confirmVideoInspirationIntent(
  asset,
  { intentType, summary },
  options = {}
) {
  if (!asset?.asset_id || !asset?.resource_version) {
    throw new Error("灵感资产信息不完整，请重新圈选");
  }
  await confirmInspirationIntent(
    asset.asset_id,
    {
      resource_version: asset.resource_version,
      intent_type: intentType,
      summary
    },
    options
  );
  return getAsset(asset.asset_id, options);
}

export async function getVisualSearchCapability(options = {}) {
  const health = await get("/api/health", options);
  const advertised =
    health?.features?.visual_search === true ||
    health?.capabilities?.visual_search?.enabled === true;
  return { advertised, health };
}

export async function createVisualSearchQuery(body, options = {}) {
  return post("/api/v1/visual-search/queries", body, {
    ...options,
    idempotencyKey: generateIdempotencyKey()
  });
}

export async function getVisualSearchQuery(queryId, options = {}) {
  return get(`/api/v1/visual-search/queries/${queryId}`, options);
}

export async function pollVisualSearchQuery(
  queryId,
  { signal, intervalMs = 650, maxAttempts = 20 } = {}
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const query = await getVisualSearchQuery(queryId, { signal });
    if (TERMINAL_STATES.has(query.status)) return query;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true }
      );
    });
  }
  throw new Error("视觉搜索等待超时");
}

export async function runVisualSearch({ cropBlob, sourceContext, signal }) {
  let mediaId = null;
  try {
    const file = new File([cropBlob], "visual-query.webp", {
      type: cropBlob.type || "image/webp"
    });
    const media = await uploadMedia(file, {
      purpose: "visual_search_query",
      retention: "temporary",
      signal
    });
    mediaId = media.media_id;
    const created = await createVisualSearchQuery(
      {
        schema_version: "1.0",
        query_media_id: mediaId,
        source_context: sourceContext,
        options: {
          max_candidates: 12,
          search_scope: ["same_item", "similar_item"]
        }
      },
      { signal }
    );
    const query = TERMINAL_STATES.has(created.status)
      ? created
      : await pollVisualSearchQuery(created.visual_search_query_id, { signal });
    if (query.status !== "succeeded") {
      throw new Error(query.error?.message || "视觉搜索失败");
    }
    return query;
  } catch (error) {
    if (mediaId) {
      deleteMedia(mediaId).catch(() => {});
    }
    throw error;
  }
}

export async function confirmVisualSearchCandidate(
  queryId,
  candidateId,
  options = {}
) {
  return post(
    `/api/v1/visual-search/queries/${queryId}/selections`,
    {
      schema_version: "1.0",
      candidate_id: candidateId,
      asset_lifecycle: "saved",
      modeling_mode: "preview_2d"
    },
    {
      ...options,
      idempotencyKey: generateIdempotencyKey()
    }
  );
}

export async function persistDemoCandidate(candidate, sourceContext, options = {}) {
  return createAsset(
    {
      schema_version: "1.0",
      asset_type: "item",
      lifecycle: "saved",
      media_ids: [],
      provenance: {
        kind: "video_context",
        provider: sourceContext.provider,
        external_content_id: sourceContext.external_content_id,
        author_display: sourceContext.author_display,
        timestamp_ms: sourceContext.timestamp_ms,
        selection_bbox: sourceContext.selection_bbox
      },
      attributes: {
        name: candidate.name,
        user_role: "wanted",
        user_note: "由视频框选生成；商品候选来自本地视觉搜索 Demo"
      }
    },
    options
  );
}
