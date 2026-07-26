import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ResourceNotFoundError } from "./errors.js";

export const DEMO_ACTOR_ID = "demo-user-001";
export const DATABASE_MIGRATION_VERSION = 2;

const TABLES = Object.freeze({
  media: {
    table: "media_objects",
    id: "media_id",
    status: (value) => (value.deleted_at ? "deleted" : "active")
  },
  assets: {
    table: "assets",
    id: "asset_id",
    status: (value) => value.parse_state || value.lifecycle
  },
  spaceVersions: {
    table: "space_versions",
    id: "space_version_id",
    status: (value) => value.state
  },
  parseRuns: {
    table: "asset_parse_runs",
    id: "parse_run_id",
    status: (value) => value.status
  },
  designRequests: {
    table: "design_requests",
    id: "design_request_id",
    status: (value) => value.validation_state
  },
  generationRuns: {
    table: "generation_runs",
    id: "generation_run_id",
    status: (value) => value.status
  },
  planAssets: {
    table: "plan_assets",
    id: "plan_asset_id",
    status: (value) => value.lifecycle
  },
  planVersions: {
    table: "plan_versions",
    id: "plan_version_id",
    status: () => "immutable"
  },
  productDiscoveryRuns: {
    table: "product_discovery_runs",
    id: "product_discovery_run_id",
    status: (value) => value.status
  },
  visualSearchQueries: {
    table: "visual_search_queries",
    id: "visual_search_query_id",
    status: (value) => value.status
  },
  relatedDesignRuns: {
    table: "related_design_runs",
    id: "related_design_run_id",
    status: (value) => value.status
  },
  publications: {
    table: "publications",
    id: "publication_id",
    status: (value) => value.status
  },
  cartIntents: {
    table: "cart_intents",
    id: "cart_intent_id",
    status: (value) => value.status
  }
});

const json = (value) => JSON.stringify(value);
const parse = (value) => JSON.parse(value);

function createEntityTableSql({ table, id }) {
  return `
    CREATE TABLE IF NOT EXISTS ${table} (
      ${id} TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      status TEXT NOT NULL,
      resource_version INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL,
      FOREIGN KEY (actor_id) REFERENCES users(actor_id)
    );
    CREATE INDEX IF NOT EXISTS idx_${table}_actor_status
      ON ${table}(actor_id, status, updated_at DESC);
  `;
}

export class SqliteRepository {
  constructor({ databasePath, now = () => new Date() }) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.databasePath = databasePath;
    this.now = now;
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
    this.#migrate();
    this.#ensureActor(DEMO_ACTOR_ID);
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    const storedVersionValue = this.db
      .prepare("SELECT value FROM metadata WHERE key = 'migration_version'")
      .get()?.value;
    if (storedVersionValue !== undefined) {
      const storedVersion = Number(storedVersionValue);
      if (
        !Number.isInteger(storedVersion) ||
        storedVersion < 1 ||
        storedVersion > DATABASE_MIGRATION_VERSION
      ) {
        throw new Error(
          `数据库 migration_version=${storedVersionValue} 与当前服务不兼容`
        );
      }
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        actor_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );
      ${Object.values(TABLES).map(createEntityTableSql).join("\n")}
      CREATE TABLE IF NOT EXISTS preferences (
        actor_id TEXT PRIMARY KEY,
        resource_version INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        data_json TEXT NOT NULL,
        FOREIGN KEY (actor_id) REFERENCES users(actor_id)
      );
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        batch_id TEXT NOT NULL,
        event_name TEXT NOT NULL,
        client_time TEXT,
        created_at TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (actor_id, event_id),
        FOREIGN KEY (actor_id) REFERENCES users(actor_id)
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        audit_id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (actor_id) REFERENCES users(actor_id)
      );
      CREATE TABLE IF NOT EXISTS idempotency_records (
        actor_id TEXT NOT NULL,
        method TEXT NOT NULL,
        route_template TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        response_status INTEGER NOT NULL,
        response_headers_json TEXT NOT NULL,
        response_body_json TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (actor_id, method, route_template, idempotency_key),
        FOREIGN KEY (actor_id) REFERENCES users(actor_id)
      );
      CREATE TABLE IF NOT EXISTS legacy_cards (
        request_id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data_json TEXT NOT NULL,
        FOREIGN KEY (actor_id) REFERENCES users(actor_id)
      );
      CREATE TABLE IF NOT EXISTS media_bindings (
        media_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (media_id, asset_id),
        FOREIGN KEY (media_id) REFERENCES media_objects(media_id),
        FOREIGN KEY (asset_id) REFERENCES assets(asset_id),
        FOREIGN KEY (actor_id) REFERENCES users(actor_id)
      );
      CREATE INDEX IF NOT EXISTS idx_media_bindings_asset
        ON media_bindings(actor_id, asset_id);
    `);
    this.setMeta("migration_version", String(DATABASE_MIGRATION_VERSION));
  }

  #ensureActor(actorId) {
    this.db
      .prepare("INSERT OR IGNORE INTO users(actor_id, created_at) VALUES (?, ?)")
      .run(actorId, this.now().toISOString());
  }

  close() {
    this.db.close();
  }

  transaction(work) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work(this);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  setMeta(key, value) {
    this.db
      .prepare(
        "INSERT INTO metadata(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
      )
      .run(key, value);
  }

  getMeta(key) {
    return this.db.prepare("SELECT value FROM metadata WHERE key = ?").get(key)?.value;
  }

  getOrCreateMediaTokenSecret() {
    const existing = this.getMeta("media_token_secret");
    if (existing) return existing;
    const created = randomBytes(32).toString("base64url");
    this.setMeta("media_token_secret", created);
    return created;
  }

  save(collection, actorId, value) {
    const definition = TABLES[collection];
    if (!definition) throw new Error(`未知 Repository collection: ${collection}`);
    this.#ensureActor(actorId);
    const id = value[definition.id];
    const statement = this.db.prepare(`
      INSERT INTO ${definition.table}
        (${definition.id}, actor_id, status, resource_version, created_at, updated_at, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(${definition.id}) DO UPDATE SET
        actor_id=excluded.actor_id,
        status=excluded.status,
        resource_version=excluded.resource_version,
        updated_at=excluded.updated_at,
        data_json=excluded.data_json
    `);
    statement.run(
      id,
      actorId,
      definition.status(value),
      value.resource_version ?? null,
      value.created_at,
      value.updated_at ?? value.created_at,
      json(value)
    );
    return structuredClone(value);
  }

  get(collection, actorId, id, { includeDeleted = false } = {}) {
    const definition = TABLES[collection];
    const row = this.db
      .prepare(
        `SELECT data_json FROM ${definition.table} WHERE ${definition.id} = ? AND actor_id = ?`
      )
      .get(id, actorId);
    if (!row) throw new ResourceNotFoundError();
    const value = parse(row.data_json);
    if (!includeDeleted && value.deleted_at) throw new ResourceNotFoundError();
    return value;
  }

  find(collection, actorId, id, options) {
    try {
      return this.get(collection, actorId, id, options);
    } catch (error) {
      if (error instanceof ResourceNotFoundError) return null;
      throw error;
    }
  }

  list(collection, actorId, { includeDeleted = false } = {}) {
    const definition = TABLES[collection];
    return this.db
      .prepare(
        `SELECT data_json FROM ${definition.table} WHERE actor_id = ? ORDER BY updated_at DESC`
      )
      .all(actorId)
      .map((row) => parse(row.data_json))
      .filter((value) => includeDeleted || !value.deleted_at);
  }

  remove(collection, actorId, id) {
    const definition = TABLES[collection];
    return this.db
      .prepare(
        `DELETE FROM ${definition.table} WHERE ${definition.id} = ? AND actor_id = ?`
      )
      .run(id, actorId).changes;
  }

  bindMedia(actorId, assetId, mediaIds) {
    const statement = this.db.prepare(
      "INSERT OR IGNORE INTO media_bindings(media_id, asset_id, actor_id, created_at) VALUES (?, ?, ?, ?)"
    );
    for (const mediaId of mediaIds) {
      statement.run(mediaId, assetId, actorId, this.now().toISOString());
    }
  }

  unbindAssetMedia(actorId, assetId) {
    const mediaIds = this.db
      .prepare(
        "SELECT media_id FROM media_bindings WHERE actor_id = ? AND asset_id = ?"
      )
      .all(actorId, assetId)
      .map((row) => row.media_id);
    this.db
      .prepare("DELETE FROM media_bindings WHERE actor_id = ? AND asset_id = ?")
      .run(actorId, assetId);
    return mediaIds;
  }

  mediaRefCount(actorId, mediaId) {
    return Number(
      this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM media_bindings WHERE actor_id = ? AND media_id = ?"
        )
        .get(actorId, mediaId).count
    );
  }

  getIdempotency(actorId, method, routeTemplate, key) {
    const row = this.db
      .prepare(
        `SELECT * FROM idempotency_records
         WHERE actor_id = ? AND method = ? AND route_template = ? AND idempotency_key = ?`
      )
      .get(actorId, method, routeTemplate, key);
    if (!row) return null;
    return {
      fingerprint: row.request_fingerprint,
      status: row.response_status,
      headers: parse(row.response_headers_json),
      body: row.response_body_json === null ? null : parse(row.response_body_json)
    };
  }

  putIdempotency(actorId, method, routeTemplate, key, fingerprint, response) {
    this.db
      .prepare(
        `INSERT INTO idempotency_records(
          actor_id, method, route_template, idempotency_key, request_fingerprint,
          response_status, response_headers_json, response_body_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        actorId,
        method,
        routeTemplate,
        key,
        fingerprint,
        response.status,
        json(response.headers || {}),
        response.body === null || response.body === undefined ? null : json(response.body),
        this.now().toISOString()
      );
  }

  getPreferences(actorId) {
    const row = this.db
      .prepare("SELECT data_json FROM preferences WHERE actor_id = ?")
      .get(actorId);
    return row ? parse(row.data_json) : null;
  }

  savePreferences(actorId, value) {
    this.#ensureActor(actorId);
    this.db
      .prepare(
        `INSERT INTO preferences(actor_id, resource_version, updated_at, data_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(actor_id) DO UPDATE SET
           resource_version=excluded.resource_version,
           updated_at=excluded.updated_at,
           data_json=excluded.data_json`
      )
      .run(actorId, value.resource_version, value.updated_at, json(value));
    return structuredClone(value);
  }

  saveEvent(actorId, batchId, value) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO events(
          event_id, actor_id, batch_id, event_name, client_time, created_at, data_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        value.event_id,
        actorId,
        batchId,
        value.event_name,
        value.client_time ?? null,
        this.now().toISOString(),
        json(value)
      );
  }

  saveAudit(actorId, value) {
    this.db
      .prepare(
        `INSERT INTO audit_logs(
          audit_id, actor_id, action, entity_type, entity_id, outcome, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        value.audit_id,
        actorId,
        value.action,
        value.entity_type,
        value.entity_id,
        value.outcome,
        value.created_at
      );
  }

  setCard(actorId, card) {
    this.db
      .prepare(
        `INSERT INTO legacy_cards(request_id, actor_id, updated_at, data_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(request_id) DO UPDATE SET
           actor_id=excluded.actor_id,
           updated_at=excluded.updated_at,
           data_json=excluded.data_json`
      )
      .run(card.request_id, actorId, this.now().toISOString(), json(card));
  }

  getCard(actorId, requestId) {
    const row = this.db
      .prepare(
        "SELECT data_json FROM legacy_cards WHERE request_id = ? AND actor_id = ?"
      )
      .get(requestId, actorId);
    return row ? parse(row.data_json) : null;
  }

  get stats() {
    const counts = {};
    for (const [collection, definition] of Object.entries(TABLES)) {
      counts[collection] = Number(
        this.db.prepare(`SELECT COUNT(*) AS count FROM ${definition.table}`).get().count
      );
    }
    return counts;
  }
}

export class PersistentCardStore {
  constructor(repository, actorId = DEMO_ACTOR_ID) {
    this.repository = repository;
    this.actorId = actorId;
  }

  set(card) {
    this.repository.setCard(this.actorId, structuredClone(card));
  }

  get(requestId) {
    const card = this.repository.getCard(this.actorId, requestId);
    if (card) return structuredClone(card);
    const error = new Error(`找不到 request_id=${requestId} 对应的持久方案`);
    error.name = "CardNotFoundError";
    error.code = "card_not_found";
    error.statusCode = 404;
    throw error;
  }

  get size() {
    return this.repository.stats.planVersions;
  }
}
