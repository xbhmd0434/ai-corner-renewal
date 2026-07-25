export class CardNotFoundError extends Error {
  constructor(requestId) {
    super(`找不到 request_id=${requestId} 对应的方案；进程重启或超过保留时间后需要重新生成`);
    this.name = "CardNotFoundError";
    this.code = "card_not_found";
    this.statusCode = 404;
  }
}

export class PlanNotFoundError extends Error {
  constructor(planId) {
    super(`当前 AICard 中不存在 plan_id=${planId}`);
    this.name = "PlanNotFoundError";
    this.code = "plan_not_found";
    this.statusCode = 404;
  }
}

export class InMemoryCardStore {
  constructor({
    ttlMs = 30 * 60 * 1000,
    maxEntries = 200,
    now = () => Date.now()
  } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.cards = new Map();
  }

  set(card) {
    this.prune();
    if (this.cards.has(card.request_id)) this.cards.delete(card.request_id);
    while (this.cards.size >= this.maxEntries) {
      const oldestRequestId = this.cards.keys().next().value;
      this.cards.delete(oldestRequestId);
    }
    this.cards.set(card.request_id, {
      card: structuredClone(card),
      expiresAt: this.now() + this.ttlMs
    });
  }

  get(requestId) {
    const entry = this.cards.get(requestId);
    if (!entry || entry.expiresAt <= this.now()) {
      this.cards.delete(requestId);
      throw new CardNotFoundError(requestId);
    }
    return structuredClone(entry.card);
  }

  prune() {
    const currentTime = this.now();
    for (const [requestId, entry] of this.cards.entries()) {
      if (entry.expiresAt <= currentTime) this.cards.delete(requestId);
    }
  }

  get size() {
    this.prune();
    return this.cards.size;
  }
}
