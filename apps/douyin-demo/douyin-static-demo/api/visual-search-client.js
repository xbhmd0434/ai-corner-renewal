import {
  get,
  post,
  generateIdempotencyKey
} from "./http-client.js";
import {
  uploadMedia,
  deleteMedia,
  createAsset
} from "./v1-client.js";

const TERMINAL_STATES = new Set(["succeeded", "failed", "cancelled"]);

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
