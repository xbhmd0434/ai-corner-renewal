import { randomUUID, randomBytes } from "node:crypto";
import { ApiError, assertNoOwnerId, conflict, invalid } from "../errors.js";

/**
 * CommerceHandoffService — 校验实施清单挑选，生成宿主 CartIntent 令牌。
 * 不创建订单、不创建交易、不返回"购买成功"。
 * P0：真实抖音购物车 Bridge 未接入时，返回 search_bundle 或 unavailable。
 */
export class CommerceHandoffService {
  constructor({ repository, now = () => new Date(), config = {} } = {}) {
    this.repository = repository;
    this.now = now;
    this.config = config;
    // demo 期：允许配置为 true 只是为了给测试用；生产默认 false
    this.hostBridgeAvailable = Boolean(config.cartBatchHandoffAvailable);
  }

  create(actorId, productDiscoveryRunId, body) {
    assertNoOwnerId(body);
    if (!body || body.schema_version !== "1.0") {
      throw invalid("cart_intent_invalid", "schema_version 必须是 1.0");
    }
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 32) {
      throw invalid("cart_intent_invalid", "items 必须是 1～32 项");
    }
    const run = this.repository.get("productDiscoveryRuns", actorId, productDiscoveryRunId);
    if (run.status !== "succeeded") {
      throw conflict(
        "product_discovery_run_not_succeeded",
        "只能对已成功的 ProductDiscoveryRun 生成购物车交接"
      );
    }
    const implementationList = run.result?.implementation_list || [];
    if (!implementationList.length) {
      throw conflict("cart_intent_stale", "该运行没有 implementation_list，请重新刷新");
    }
    const listById = new Map(implementationList.map((item) => [item.list_item_id, item]));
    const subjectById = new Map(
      (run.result?.subjects || []).map((subject) => [subject.subject_id, subject])
    );
    // 校验每条 item 都属于该 run，match_id 存在，quantity 合法
    const seenListItems = new Set();
    const rejected = [];
    const accepted = [];
    for (const [index, item] of body.items.entries()) {
      const path = `items[${index}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw invalid("cart_intent_invalid", `${path} 必须是对象`);
      }
      if (typeof item.list_item_id !== "string" || !item.list_item_id.trim()) {
        throw invalid("cart_intent_invalid", `${path}.list_item_id 必须是字符串`);
      }
      if (typeof item.match_id !== "string" || !item.match_id.trim()) {
        throw invalid("cart_intent_invalid", `${path}.match_id 必须是字符串`);
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) {
        throw invalid("cart_intent_invalid", `${path}.quantity 必须是 1～100 整数`);
      }
      if (seenListItems.has(item.list_item_id)) {
        throw invalid("cart_intent_invalid", `${path}.list_item_id 重复`);
      }
      seenListItems.add(item.list_item_id);
      const listItem = listById.get(item.list_item_id);
      if (!listItem) {
        rejected.push({ list_item_id: item.list_item_id, reason_code: "list_item_not_in_run" });
        continue;
      }
      // 校验 match_id 属于同一 subject 的 matches
      const subject = subjectById.get(listItem.subject_id);
      const candidateMatch = subject?.matches?.find((m) => m.match_id === item.match_id);
      if (!candidateMatch) {
        rejected.push({ list_item_id: item.list_item_id, reason_code: "match_not_in_subject" });
        continue;
      }
      // 校验商品仍可售（demo 目录一律 status="demo" 视为可售）
      if (candidateMatch.availability?.status !== "demo") {
        rejected.push({ list_item_id: item.list_item_id, reason_code: "match_unavailable" });
        continue;
      }
      accepted.push({
        list_item_id: item.list_item_id,
        match_id: item.match_id,
        product_id: candidateMatch.product_id,
        quantity: item.quantity
      });
    }

    const cartIntentId = `cart-intent-${randomUUID()}`;
    const now = this.now().toISOString();
    let status;
    let action;
    if (accepted.length === 0) {
      status = "unavailable";
      action = { type: "unavailable", token: null, expires_at: null };
    } else if (this.hostBridgeAvailable) {
      status = accepted.length === body.items.length ? "ready" : "partial";
      const token = randomBytes(24).toString("base64url");
      const expiresAt = new Date(this.now().getTime() + 10 * 60 * 1000).toISOString();
      action = { type: "douyin_cart_batch", token, expires_at: expiresAt };
    } else {
      status = accepted.length === body.items.length ? "ready" : "partial";
      const token = randomBytes(24).toString("base64url");
      const expiresAt = new Date(this.now().getTime() + 10 * 60 * 1000).toISOString();
      action = { type: "search_bundle", token, expires_at: expiresAt };
    }

    const record = {
      schema_version: "1.0",
      cart_intent_id: cartIntentId,
      product_discovery_run_id: productDiscoveryRunId,
      status,
      accepted_count: accepted.length,
      accepted_items: accepted, // 不 leak 到 summary
      rejected,
      action,
      created_at: now
    };
    // 存储 token 但不写入日志：Repository.save 只做 SQLite 存储；生产可加密
    this.repository.save("cartIntents", actorId, record);
    return this.summary(record);
  }

  get(actorId, cartIntentId) {
    const record = this.repository.get("cartIntents", actorId, cartIntentId);
    return this.summary(record);
  }

  summary(record) {
    return {
      schema_version: "1.0",
      cart_intent_id: record.cart_intent_id,
      status: record.status,
      accepted_count: record.accepted_count,
      rejected: record.rejected.map((item) => ({
        list_item_id: item.list_item_id,
        reason_code: item.reason_code
      })),
      action: {
        type: record.action.type,
        token: record.action.token || null,
        expires_at: record.action.expires_at || null
      },
      created_at: record.created_at
    };
  }
}
