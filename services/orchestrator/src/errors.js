export class ApiError extends Error {
  constructor(code, message, statusCode, details = undefined, issues = undefined) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.issues = issues;
  }
}

export class ResourceNotFoundError extends ApiError {
  constructor(resource = "资源") {
    super("resource_not_found", `${resource}不存在`, 404);
    this.name = "ResourceNotFoundError";
  }
}

export function assertNoOwnerId(value, path = "$") {
  if (!value || typeof value !== "object") return;
  if (Object.prototype.hasOwnProperty.call(value, "owner_id")) {
    throw new ApiError(
      "owner_id_not_allowed",
      "用户身份由服务端注入，客户端不能提交 owner_id",
      422,
      undefined,
      [{ path: `${path}/owner_id`, code: "field_not_allowed", message: "请删除 owner_id" }]
    );
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoOwnerId(item, `${path}/${index}`));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (item && typeof item === "object") {
      assertNoOwnerId(item, `${path}/${key}`);
    }
  }
}

export function conflict(code, message, details) {
  return new ApiError(code, message, 409, details);
}

export function invalid(code, message, issues = undefined) {
  return new ApiError(code, message, 422, undefined, issues);
}
