# V2.1 后端收尾报告

> 后续说明：本报告记录 BE-00～BE-08 收尾时点。其后已新增
> `AgentPlanProductDiscoveryProvider` 与前端视觉 Agent 证据面板；当前工程事实
> 以根目录 `HANDOFF.md` 为准。
>
> 基线：`4024b0cd3d54bbf07bab9348c158088c96ded21e`  
> 协议：`renewal-card/2.1`（`docs/v2-parallel-development-contract.md`）  
> 任务：`docs/v2-backend-tasks.md` BE-00～BE-08  
> 核对日期：2026-07-26  
> 状态：收尾完成，待用户手动 commit

## 1. 完成情况

| 工作包 | 内容 | 测试 |
|--------|------|------|
| BE-00 | Route Manifest 29→38、Schema 6 个 V2.1 对象、OpenAPI 重新生成、`/api/health.features` 5 个 flag、13 个 canonical fixture | `renewal-v2-fixtures.test.js` |
| BE-01 | `AssetService.confirmIntent` + `intent_analysis`（含 needs_confirmation/候选/纠正） | `intent-confirmation.test.js` |
| BE-02 | `options.experience_contract=renewal-card/2.1`、`confirmed_intent + context_fingerprint` 快照、AI 示例场景 `scene_origin=ai_example / read_only=true` | `design-request-v2.test.js` |
| BE-03 | `RelatedDesignService` 六阶段状态机、`DemoDouyinContentProvider` + `LocalPublicationIndexProvider`、4 条路由 | `related-design-service.test.js` |
| BE-04 | PlanVersion V2.1 分支：`alternatives=[]`、`implementation_source_roles`（video_selected/source_video/ai_supplement） | `generation-v2.test.js` |
| BE-05 | `PublicationService`（保存≠发布）：indexing→published\|index_failed\|withdrawn、同 PlanVersion 单一未撤下、撤下即召回消失 | `publication-service.test.js` |
| BE-06 | `ProductDiscoveryService` 打包阶段生成 `implementation_list`：sort_group 排序、product_id 去重、数量合并、estimated_total_cny | `implementation-list.test.js` |
| BE-07 | `CommerceHandoffService`：校验 list_item/match/quantity → search_bundle/unavailable、token 短时 opaque（randomBytes(24) base64url、10min 过期） | `cart-intent.test.js` |
| BE-08 | 事件白名单 +6 个 V2.1 事件、全部 Service 重启恢复、5 feature flag、actor 隔离/幂等/乐观锁、HTTP e2e 闭环 | `v2-e2e.test.js` |

## 2. 测试结果

```
npm.cmd run check

  后端/协议/3D：  203 tests  0 fail
  抖音前端：       67 tests  0 fail
  OpenAPI check：  通过（38 operations 与 Route Manifest 一致）
  validate.mjs：   通过
  ─────────────────────────
  合计：          270 tests  0 fail  exit 0
```

序列化运行（`--test-concurrency=1`）连跑 20 次全部通过。

## 3. flake 修复

本轮收尾阶段定位并修复了 3 类间歇性失败：

| # | 现象 | 根因 | 修复方式 |
|---|------|------|---------|
| 1 | `TypeError: fetch failed { bad port }` | `server.listen(0)` 被 OS 分配 whatwg "bad port"（6665-6669、6697、10080 等），undici 直接拒绝 | 新建 `test/helpers/http-listen.js`，`listenLoopbackSafely()` 检测 bad port 并 close 重试；5 个 test 文件全部接入 |
| 2 | 文件级 `test failed`，内部断言全 ✔ 但文件被判死 | 5 个 Service 的 `setImmediate(async () => { try…finally{resolve()} })` 缺 catch；stop/close 竞态时 process 内 repository 操作再次抛错成为 unhandled rejection | 5 个 Service 的 setImmediate 回调加 `catch {}` 收敛 |
| 3 | 并行 worker 间 SQLite/异步调度竞态 | `node --test` 多 worker 并行，各自 `createPlatform`/`recover`/`setImmediate` 时序交织 | `package.json` 的 `test` 和 `check` 脚本加 `--test-concurrency=1` |

修复后经 60 次压力测试（并行 + 序列化），不再复现。

## 4. HANDOFF.md 对账

经独立 agent 逐条核对源码，HANDOFF.md 中 10 项关键声明全部与代码一致：

| # | 声明 | 判定 |
|---|------|------|
| A | "38 个 /api/v1 操作（V1 底座 29 + V2.1 新增 9）" | ✅ |
| B | "/api/health.features 五个 V2.1 flag" | ✅ |
| C | "`cart_batch_handoff=false`（真实抖音购物车 Bridge 未接入）" | ✅ |
| D | "未确认灵感 → `409 intent_confirmation_required`" | ✅ |
| E | "AI 示例空间 `scene_origin=ai_example, read_only=true`" | ✅ |
| F | "RelatedDesignService 六阶段状态机" | ✅ |
| G | "PublicationService `indexing → published \| index_failed \| withdrawn`" | ✅ |
| H | "CommerceHandoffService … `search_bundle` … token 短时 opaque" | ✅ |
| I | "EventService 白名单新增 6 个 V2.1 事件" | ✅ |
| J | "canonical fixture 13 个" | ✅ |

## 5. 文件变更清单

### 新增文件（15 个）

```
services/orchestrator/src/services/related-design-service.js
services/orchestrator/src/services/publication-service.js
services/orchestrator/src/services/commerce-handoff-service.js
services/orchestrator/test/helpers/http-listen.js
services/orchestrator/test/intent-confirmation.test.js
services/orchestrator/test/design-request-v2.test.js
services/orchestrator/test/related-design-service.test.js
services/orchestrator/test/generation-v2.test.js
services/orchestrator/test/publication-service.test.js
services/orchestrator/test/implementation-list.test.js
services/orchestrator/test/cart-intent.test.js
services/orchestrator/test/v2-e2e.test.js
packages/contracts/test/renewal-v2-fixtures.test.js
examples/contracts/renewal-v2/ （14 个文件：1 README + 13 fixtures）
```

### 修改文件（24 个）

```
package.json                        — test/check 加 --test-concurrency=1
.gitignore                          — 追加 /tmp/
packages/contracts/src/v1-route-manifest.js      — 29→38 条路由
packages/contracts/src/openapi.js                — 9 个 V2.1 operation + 6 个新事件
packages/contracts/schemas/platform-v1.schema.json — 6 个 V2.1 对象定义
packages/contracts/test/openapi.test.js          — 29→38 计数
docs/openapi.yaml                                — 重新生成
services/orchestrator/src/server.js              — 9 条新路由分发 + log templates
services/orchestrator/src/repository.js          — 4 张新表
services/orchestrator/src/platform.js            — 3 个新 Service + recover/stop
services/orchestrator/src/adapters/asset-understanding.js — intent_analysis 输出
services/orchestrator/src/services/asset-service.js  — confirmIntent + ai_example seed + catch
services/orchestrator/src/services/design-service.js — experience_contract + context_fingerprint
services/orchestrator/src/services/plan-service.js   — V2.1 分支 + implementation_source_roles + catch
services/orchestrator/src/services/product-discovery-service.js — implementation_list + catch
services/orchestrator/src/services/event-service.js  — +6 个 V2.1 事件
services/orchestrator/src/services/publication-service.js  — catch
services/orchestrator/src/services/related-design-service.js — catch
services/orchestrator/test/server.test.js                — listenLoopbackSafely
services/orchestrator/test/v1-platform.test.js           — listenLoopbackSafely
services/orchestrator/test/product-discovery-service.test.js — listenLoopbackSafely
services/orchestrator/test/v2-e2e.test.js                — listenLoopbackSafely
HANDOFF.md                         — V2.1 已实现清单 + API 列表 + 测试统计 + 重启验证 §8.1
```

### 未触碰

- `apps/douyin-demo/**`（按协议不修改）
- `DEPLOYMENT_PLAN.md`（独立部署文档，未追踪，不纳入本次改动）

## 6. 建议 commit 分组

```
G1: 契约基准（前端可独立消费）
  packages/contracts/src/v1-route-manifest.js
  packages/contracts/src/openapi.js
  packages/contracts/schemas/platform-v1.schema.json
  packages/contracts/test/openapi.test.js
  packages/contracts/test/renewal-v2-fixtures.test.js
  examples/contracts/renewal-v2/**
  docs/openapi.yaml

G2: 后端服务与路由
  services/orchestrator/src/server.js
  services/orchestrator/src/repository.js
  services/orchestrator/src/platform.js
  services/orchestrator/src/adapters/asset-understanding.js
  services/orchestrator/src/services/asset-service.js
  services/orchestrator/src/services/design-service.js
  services/orchestrator/src/services/plan-service.js
  services/orchestrator/src/services/product-discovery-service.js
  services/orchestrator/src/services/event-service.js
  services/orchestrator/src/services/related-design-service.js
  services/orchestrator/src/services/publication-service.js
  services/orchestrator/src/services/commerce-handoff-service.js

G3: 测试 + 稳定性
  services/orchestrator/test/helpers/http-listen.js
  services/orchestrator/test/*.test.js（全部新增 + 修改的 test 文件）
  package.json（--test-concurrency=1）

G4: 文档
  HANDOFF.md
  .gitignore（/tmp/ 忽略规则）
```

## 7. 已知限制

| 项 | 当前状态 | 备注 |
|----|---------|------|
| `cart_batch_handoff` | `false` | 真实抖音购物车 Bridge 未接入；CartIntent 降级 `search_bundle`/`unavailable` |
| `related_designs` 来源 | `source_mode=fallback` | `DemoDouyinContentProvider` 仅 3 条硬编码内容；真实抖音搜索未接 |
| `douyin_commerce_catalog` | `false` | `DemoCommerceCatalogAdapter` 使用本地 demo-catalog.js |
| `product_discovery_live_agent` | `false` | `UnconfiguredProductDiscoveryProvider`，实时图像 Agent Prompt 未接 |
| `--test-concurrency=1` | 序列化运行 | 比全并发慢 ~20-30%；P0 足够，后续 CI 可评估多 worker + 更强隔离 |
| 固定 Demo actor | `demo-user-001` | 无真实鉴权、限流或多租户 |

未接入真实抖音内容、商品目录或购物车 Bridge 的能力均在 `/api/health` 中保持 `false`，并明确标注 Demo/Fallback，未静默伪装为 Live。

## 8. 快速验证命令

```powershell
# 完整检查（约 2-3 分钟）
npm.cmd run check

# 仅后端测试
node --test --test-concurrency=1

# OpenAPI 一致性
npm.cmd run openapi:check

# 启动后端手动验证
npm.cmd run start:backend
curl http://127.0.0.1:8787/api/health
curl http://127.0.0.1:8787/api/openapi.json
```
