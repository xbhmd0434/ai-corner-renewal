import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { extname, join } from "node:path";
import { ApiError, conflict } from "../errors.js";

const MEDIA_TYPES = Object.freeze({
  "image/jpeg": { extension: ".jpg", magic: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 },
  "image/png": {
    extension: ".png",
    magic: (bytes) =>
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )
  },
  "image/webp": {
    extension: ".webp",
    magic: (bytes) =>
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
  }
});

const ALLOWED_PURPOSES = new Set([
  "space_source",
  "reference_source",
  "visual_search_query",
  "generated_render"
]);

function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        width: bytes.readUInt16BE(offset + 7),
        height: bytes.readUInt16BE(offset + 5)
      };
    }
    offset += 2 + length;
  }
  throw new ApiError("image_dimensions_unreadable", "无法读取 JPEG 尺寸", 422);
}

function sanitizeJpeg(bytes) {
  const chunks = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff || offset + 1 >= bytes.length) {
      chunks.push(bytes.subarray(offset));
      break;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xda) {
      chunks.push(bytes.subarray(offset));
      break;
    }
    if (marker === 0xd9) {
      chunks.push(bytes.subarray(offset, offset + 2));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) {
      throw new ApiError("invalid_image", "JPEG 文件结构不完整", 422);
    }
    const length = bytes.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) {
      throw new ApiError("invalid_image", "JPEG 段长度不合法", 422);
    }
    const isPrivateMetadata =
      marker === 0xe1 ||
      marker === 0xed ||
      marker === 0xef ||
      (marker >= 0xe3 && marker <= 0xec) ||
      marker === 0xfe;
    if (!isPrivateMetadata) chunks.push(bytes.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(chunks);
}

function parsePng(bytes) {
  const chunks = [bytes.subarray(0, 8)];
  let dimensions;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new ApiError("invalid_image", "PNG Chunk 不完整", 422);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IHDR") {
      dimensions = {
        width: bytes.readUInt32BE(offset + 8),
        height: bytes.readUInt32BE(offset + 12)
      };
    }
    if (!["eXIf", "tEXt", "zTXt", "iTXt"].includes(type)) {
      chunks.push(bytes.subarray(offset, end));
    }
    offset = end;
    if (type === "IEND") break;
  }
  if (!dimensions) throw new ApiError("invalid_image", "PNG 缺少 IHDR", 422);
  return { sanitized: Buffer.concat(chunks), dimensions };
}

function parseWebp(bytes) {
  const outputChunks = [];
  let dimensions;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.subarray(offset, offset + 4).toString("ascii");
    const length = bytes.readUInt32LE(offset + 4);
    const paddedLength = length + (length % 2);
    const end = offset + 8 + paddedLength;
    if (end > bytes.length) throw new ApiError("invalid_image", "WebP Chunk 不完整", 422);
    let chunk = Buffer.from(bytes.subarray(offset, end));
    if (type === "VP8X" && length >= 10) {
      chunk[8] &= ~(0x08 | 0x04);
      dimensions = {
        width: 1 + chunk.readUIntLE(12, 3),
        height: 1 + chunk.readUIntLE(15, 3)
      };
    } else if (type === "VP8 " && length >= 10) {
      dimensions = {
        width: bytes.readUInt16LE(offset + 14) & 0x3fff,
        height: bytes.readUInt16LE(offset + 16) & 0x3fff
      };
    } else if (type === "VP8L" && length >= 5) {
      const bits = bytes.readUInt32LE(offset + 9);
      dimensions = {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >> 14) & 0x3fff)
      };
    }
    if (!["EXIF", "XMP "].includes(type)) outputChunks.push(chunk);
    offset = end;
  }
  if (!dimensions) throw new ApiError("image_dimensions_unreadable", "无法读取 WebP 尺寸", 422);
  const payload = Buffer.concat([Buffer.from("WEBP"), ...outputChunks]);
  const header = Buffer.alloc(8);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(payload.length, 4);
  return { sanitized: Buffer.concat([header, payload]), dimensions };
}

function sanitizeAndInspect(mediaType, bytes) {
  if (mediaType === "image/jpeg") {
    const dimensions = jpegDimensions(bytes);
    return { sanitized: sanitizeJpeg(bytes), dimensions };
  }
  if (mediaType === "image/png") return parsePng(bytes);
  return parseWebp(bytes);
}

function extensionMatches(filename, expected) {
  const actual = extname(filename || "").toLowerCase();
  if (expected === ".jpg") return [".jpg", ".jpeg"].includes(actual);
  return actual === expected;
}

export class SourceIngestionService {
  constructor({ repository, config, now = () => new Date() }) {
    this.repository = repository;
    this.config = config;
    this.now = now;
    this.tokenSecret = repository.getOrCreateMediaTokenSecret();
    mkdirSync(config.privateMediaDirectory, { recursive: true });
  }

  create(actorId, { file, purpose, retention = "temporary" }) {
    if (!file || !Buffer.isBuffer(file.bytes)) {
      throw new ApiError("media_file_required", "multipart 请求必须包含 file", 422);
    }
    if (!ALLOWED_PURPOSES.has(purpose)) {
      throw new ApiError(
        "media_purpose_invalid",
        "purpose 必须是 space_source 或 reference_source",
        422
      );
    }
    if (retention !== "temporary") {
      throw new ApiError("media_retention_invalid", "P0 只接受 temporary", 422);
    }
    if (file.bytes.length > this.config.maxUploadBytes) {
      throw new ApiError(
        "payload_too_large",
        `单个文件不能超过 ${this.config.maxUploadBytes} 字节`,
        413
      );
    }
    const mediaDefinition = MEDIA_TYPES[file.contentType];
    if (!mediaDefinition) {
      throw new ApiError(
        "unsupported_media_type",
        "只支持 image/jpeg、image/png 或 image/webp",
        415
      );
    }
    if (
      !extensionMatches(file.filename, mediaDefinition.extension) ||
      !mediaDefinition.magic(file.bytes)
    ) {
      throw new ApiError(
        "media_signature_mismatch",
        "文件扩展名、MIME 与真实签名不一致",
        415
      );
    }

    const { sanitized, dimensions } = sanitizeAndInspect(
      file.contentType,
      file.bytes
    );
    if (
      dimensions.width < 1 ||
      dimensions.height < 1 ||
      dimensions.width > 20_000 ||
      dimensions.height > 20_000
    ) {
      throw new ApiError("image_dimensions_invalid", "图片尺寸超出允许范围", 422);
    }

    const mediaId = `media-${randomUUID()}`;
    const storageKey = `${mediaId}${mediaDefinition.extension}`;
    const target = join(this.config.privateMediaDirectory, storageKey);
    const temporary = `${target}.uploading`;
    writeFileSync(temporary, sanitized, { flag: "wx" });
    renameSync(temporary, target);

    const createdAt = this.now();
    const expiresAt = new Date(
      createdAt.getTime() + this.config.temporaryRetentionHours * 60 * 60 * 1000
    );
    const record = {
      schema_version: "1.0",
      media_id: mediaId,
      media_type: file.contentType,
      width_px: dimensions.width,
      height_px: dimensions.height,
      byte_size: sanitized.length,
      sanitized: true,
      purpose,
      storage_key: storageKey,
      retention_expires_at: expiresAt.toISOString(),
      deleted_at: null,
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString()
    };
    try {
      this.repository.save("media", actorId, record);
    } catch (error) {
      rmSync(target, { force: true });
      throw error;
    }
    return this.project(actorId, record);
  }

  /**
   * Trusted bootstrap path for bundled demo inputs.
   * Unlike user uploads, starter media has a stable id and permanent retention so
   * the read-only initial scenario survives restarts and can be referenced by
   * DesignRequest snapshots.
   */
  ensureBundled(actorId, { mediaId, filePath, filename, contentType, purpose }) {
    if (!mediaId || !filePath || !filename || !contentType) {
      throw new Error("Bundled media metadata is incomplete");
    }
    if (!ALLOWED_PURPOSES.has(purpose)) {
      throw new Error(`Unsupported bundled media purpose: ${purpose}`);
    }
    const mediaDefinition = MEDIA_TYPES[contentType];
    const sourceBytes = readFileSync(filePath);
    if (
      !mediaDefinition ||
      !extensionMatches(filename, mediaDefinition.extension) ||
      !mediaDefinition.magic(sourceBytes)
    ) {
      throw new Error(`Bundled media signature mismatch: ${filename}`);
    }
    const { sanitized, dimensions } = sanitizeAndInspect(
      contentType,
      sourceBytes
    );
    const storageKey = `${mediaId}${mediaDefinition.extension}`;
    const target = join(this.config.privateMediaDirectory, storageKey);
    if (!existsSync(target)) {
      writeFileSync(target, sanitized, { flag: "wx" });
    }
    const existing = this.repository.find("media", actorId, mediaId, {
      includeDeleted: true
    });
    const createdAt = existing?.created_at || this.now().toISOString();
    const record = {
      schema_version: "1.0",
      media_id: mediaId,
      media_type: contentType,
      width_px: dimensions.width,
      height_px: dimensions.height,
      byte_size: sanitized.length,
      sanitized: true,
      purpose,
      storage_key: storageKey,
      retention_expires_at: null,
      deleted_at: null,
      created_at: createdAt,
      updated_at: existing?.updated_at || createdAt
    };
    this.repository.save("media", actorId, record);
    return this.project(actorId, record);
  }

  project(actorId, record) {
    const { token, expiresAt } = this.#issueToken(actorId, record);
    return {
      schema_version: "1.0",
      media_id: record.media_id,
      media_type: record.media_type,
      width_px: record.width_px,
      height_px: record.height_px,
      byte_size: record.byte_size,
      sanitized: record.sanitized,
      retention_expires_at: record.retention_expires_at,
      access: {
        url: `/api/v1/media/${record.media_id}/content?token=${token}`,
        expires_at: expiresAt
      },
      created_at: record.created_at
    };
  }

  getContent(actorId, mediaId, token) {
    const record = this.repository.get("media", actorId, mediaId);
    if (!token || !this.#verifyToken(actorId, record, token)) {
      throw new ApiError("media_not_found", "媒体不存在", 404);
    }
    const path = join(this.config.privateMediaDirectory, record.storage_key);
    if (!existsSync(path)) throw new ApiError("media_not_found", "媒体不存在", 404);
    return {
      bytes: readFileSync(path),
      mediaType: record.media_type,
      filename: `${record.media_id}${MEDIA_TYPES[record.media_type].extension}`
    };
  }

  getForProvider(actorId, mediaId) {
    const record = this.repository.get("media", actorId, mediaId);
    const path = join(this.config.privateMediaDirectory, record.storage_key);
    if (!existsSync(path)) throw new ApiError("media_not_found", "媒体不存在", 404);
    return {
      mediaType: record.media_type,
      dataUrl: `data:${record.media_type};base64,${readFileSync(path).toString("base64")}`
    };
  }

  deleteUnbound(actorId, mediaId) {
    const record = this.repository.get("media", actorId, mediaId, {
      includeDeleted: true
    });
    if (record.deleted_at) return;
    if (this.repository.mediaRefCount(actorId, mediaId) > 0) {
      throw conflict(
        "media_still_referenced",
        "媒体仍被有效资产引用，请通过资产删除流程处理"
      );
    }
    this.#deletePhysical(record);
    record.deleted_at = this.now().toISOString();
    record.updated_at = record.deleted_at;
    this.repository.save("media", actorId, record);
  }

  deleteIfUnreferenced(actorId, mediaId) {
    if (this.repository.mediaRefCount(actorId, mediaId) > 0) return false;
    const record = this.repository.find("media", actorId, mediaId, {
      includeDeleted: true
    });
    if (!record || record.deleted_at) return false;
    this.#deletePhysical(record);
    record.deleted_at = this.now().toISOString();
    record.updated_at = record.deleted_at;
    this.repository.save("media", actorId, record);
    return true;
  }

  cleanupExpired(actorId) {
    const nowMs = this.now().getTime();
    for (const record of this.repository.list("media", actorId)) {
      if (
        record.retention_expires_at &&
        Date.parse(record.retention_expires_at) <= nowMs &&
        this.repository.mediaRefCount(actorId, record.media_id) === 0
      ) {
        this.deleteUnbound(actorId, record.media_id);
      }
    }
  }

  #deletePhysical(record) {
    const path = join(this.config.privateMediaDirectory, record.storage_key);
    rmSync(path, { force: true });
  }

  #issueToken(actorId, record) {
    const expires = Math.floor(
      (this.now().getTime() + this.config.mediaAccessTtlSeconds * 1000) / 1000
    );
    const payload = Buffer.from(
      JSON.stringify({
        media_id: record.media_id,
        actor_id: actorId,
        purpose: record.purpose,
        expires
      })
    ).toString("base64url");
    const signature = createHmac("sha256", this.tokenSecret)
      .update(payload)
      .digest("base64url");
    return {
      token: `${payload}.${signature}`,
      expiresAt: new Date(expires * 1000).toISOString()
    };
  }

  #verifyToken(actorId, record, token) {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return false;
    const expected = createHmac("sha256", this.tokenSecret)
      .update(payload)
      .digest();
    let provided;
    try {
      provided = Buffer.from(signature, "base64url");
    } catch {
      return false;
    }
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return false;
    }
    try {
      const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      return (
        value.media_id === record.media_id &&
        value.actor_id === actorId &&
        value.purpose === record.purpose &&
        Number.isInteger(value.expires) &&
        value.expires >= Math.floor(this.now().getTime() / 1000)
      );
    } catch {
      return false;
    }
  }
}
