// 共享 HTTP test helper：把 `server` 绑到 127.0.0.1 上一个非 bad-port 的随机端口。
//
// 背景：Node 的 `server.listen(0, host, cb)` 在部分 OS/内核版本下，OS 会从可分配
// 端口池里挑一个较低段的端口（例如 6665–6669 IRC、6697 IRCS、10080）。这些端口
// 属于 whatwg fetch spec 的 "bad port list"，undici 会用 `TypeError: fetch failed
// { cause: Error: bad port }` 直接拒绝。用户的 test 断言此时会随机失败。
//
// 修复：如果 `server.address().port` 命中 bad port，close 掉重新 listen；最多
// 重试若干次。上层测试逻辑不需要感知端口本身。
//
// 该 helper 仅用于测试；不影响生产 API 行为。生产 `createApiServer` 由 caller
// 显式绑定固定端口（默认 8787），不会走这条路径。

// whatwg fetch spec 的 bad port list（HTTP fetch 会拒绝的端口）：
// https://fetch.spec.whatwg.org/#bad-port
const BAD_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6697, 10080
]);

function isBadPort(port) {
  return BAD_PORTS.has(port);
}

/**
 * 让 `server` 绑到 127.0.0.1 的一个非 bad-port 端口。
 * @param {import("node:http").Server} server
 * @param {{ maxRetries?: number }} [opts]
 * @returns {Promise<{ port: number, baseUrl: string }>}
 */
export async function listenLoopbackSafely(server, { maxRetries = 20 } = {}) {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("error", onError);
        reject(error);
      };
      server.once("error", onError);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", onError);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address.port !== "number") {
      throw new Error("server.address() 未返回有效端口");
    }
    if (!isBadPort(address.port)) {
      return {
        port: address.port,
        baseUrl: `http://127.0.0.1:${address.port}`
      };
    }
    // 命中 bad port（whatwg fetch 会拒绝），关掉重来。
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
  throw new Error(
    `listen(0) 在 ${maxRetries} 次尝试后仍分配到 bad port，请检查 OS ephemeral port range`
  );
}
