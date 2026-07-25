# AI 一角焕新

把短视频里的家居灵感，适配到我的真实空间。

AI 一角焕新是一个面向年轻租房和家居兴趣用户的空间适配产品原型。用户选择一段家居灵感、上传自己的书桌照片并补充预算和生活限制，系统生成可预览、可解释、可购买、可执行的一角焕新方案。

> 当前集成版本的主界面位于 `apps/douyin-demo`。推荐流、图片上传、空间解析与
> 确认、设计任务、生成进度、资产历史和方案详情已经接入资源化 `/api/v1` 与
> SQLite 持久化后端。兼容 AICard 页面、Agent Plan 空间理解、Seedream 主方案
> 效果图和独立 3D 试搭仍保留在 `apps/web`，可通过独立命令运行。
> 商品库存、内容召回、候选方案效果图和预算调整后的效果图仍使用可重复的样例
> 数据，不代表已经接入抖音内部接口。
> 独立的“挂件试搭实验室”已能加载本机 Hunyuan3D-2mini 生成的 shape-only GLB，
> 让包和挂件作为两个资产进行挂点、位姿、多视角和本地方案保存；这仍是视觉适配
> MVP，不代表尺寸、承重、软体形变或物理碰撞已经验证。
> 本项目不是抖音官方产品，也不宣称拥有任何平台私有数据。

## 在线体验范围

当前默认启动版本跑通：

```text
从推荐流进入焕新，或直接上传图片
→ 上传空间
→ 确认空间识别结果并封存版本
→ 设置预算与硬约束
→ 创建任务并查看生成进度
→ 查看前后效果、商品、步骤与校验
→ 从资产和方案历史重新打开
```

焕新界面采用单核心卡片：灵感、真实空间、生活约束、生成进度和结果都在同一
上下文中切换；“我的收藏”和“历史方案”使用底部抽屉，不再把用户带到独立后台页。
桌面端显示项目叙事与 430px 手机舞台，移动端直接占满视口。

主要特性：

- 三组可切换的家居灵感与结构化提取结果
- JPEG/PNG/WebP 上传、私有媒体存储、短时访问地址和空间版本确认
- 资产、不可变任务快照、异步运行、方案版本与重启后恢复
- 预算、租房、保留家具和宠物等约束
- 改造前后对比、商品清单、步骤和可信校验
- 结果中继续降低预算或更换风格，每次调整创建新的方案版本
- 推荐流“焕新”入口携带当前视频的最小灵感上下文
- 视频手动暂停后可进入“一角焕新”定帧框选，选择明确标注的视觉搜索候选，
  并把用户确认的商品保存为独立单品资产；真实视觉搜索与模型版本接口仍待后端实现
- 桌面端和移动端响应式体验
- 独立 3D 橱窗：包/挂件切换、推荐挂点、拖动、旋转、缩放与四个预设视角
- 浏览器内加载 GLB、导出当前视角 PNG、`localStorage` 保存和恢复组合关系
- 本机 Hunyuan3D-2mini 离线生成适配器；已生成 GLB 自动载入，失败时明确降级
- 独立 Prompt 实验台：上传真实家居角落，先由视觉文本 Agent 生成布置方案和
  商品槽位，再把确定方案编译给 Seedream；并排查看和下载结果，实验数据不入库

## 本地运行

需要 Node.js 22.5 或更高版本（推荐 Node 24）。Three.js 固定为 `0.180.0`，
首次运行先安装依赖：

```bash
npm install
npm run check
npm run check:douyin-integration
npm start
```

打开 `http://127.0.0.1:8765/douyin-static-demo/index.html`；后端默认运行于
`http://127.0.0.1:8787`。如果默认端口已被占用，启动器会复用兼容后端并自动
选择空闲前端端口，请以终端打印地址为准。

`npm start` 会同时启动抖音前端、同源 API 代理和持久化后端。只启动新版静态
前端可使用 `npm run start:douyin-web`，只启动后端使用
`npm run start:backend`。旧兼容 AICard/Agent Plan 页面使用
`npm run start:classic`，其 3D 试搭地址为
`http://127.0.0.1:8765/accessory-studio.html`。
同一命令还会提供
`http://127.0.0.1:8765/prompt-lab.html`。Prompt 实验台读取服务端 Key，浏览器
不会接触密钥；需要 `.env.local` 中启用 `AI_BACKEND_MODE=auto` 或 `live` 并配置
`AGENT_PLAN_API_KEY`。上传图会在浏览器压缩后只用于本次请求，结果不会保存到
SQLite 或 `data/private-media`；每次点击“开始改图”会先产生一次文本规划调用，
规划返回 `ready` 后再产生一次真实图片调用。非家居或不可判断场景返回
`needs_input`，不会继续消耗图片调用。
后端可独立验证：

```bash
npm run demo:backend
```

这条命令会完成 `health → generate(¥500) → revise(¥300)`，验证调整后的
商品组合、总价和校验报告一致。完整接口说明见
[`docs/backend-api.md`](docs/backend-api.md)。

本地后端会读取项目根目录下被 Git 忽略的 `.env` 和 `.env.local`，但操作系统/
部署平台环境变量优先。配置 Agent Plan 时只把专属 Key 放入 `.env.local`，然后
运行低消耗鉴权检查：

```bash
npm run check:agent-plan
npm run check:agent-plan-room
npm run check:agent-plan-image
```

第一条命令做低消耗文本鉴权；第二条验收真实多模态 RoomProfile；第三条完整验收
`RoomProfile → Seedream → 私有媒体读取`。三者都不输出 Key、图片 Base64、
完整提示词或供应方正文。真实空间理解与生图需把 `AI_BACKEND_MODE=auto` 和
`ROOM_ANALYZER_PROVIDER=agent_plan` 写入 `.env.local`；失败时仍返回同协议 Demo
fallback。

本机已经存在 Hunyuan3D-2mini 专用 Python 环境和模型缓存时，可生成无纹理 GLB：

```bash
npm run generate:3d -- --input path/to/item.png --output apps/web/assets/models/item.glb
```

先检查路径但不加载约 3.8 GB 权重时，在末尾加 `--dry-run`。默认使用
`D:\LittleBlueWhale3D\.venv-hunyuan3d` 与
`D:\LittleBlueWhale3D\.model-cache`；其他机器通过 `HUNYUAN_PYTHON` 和
`HUNYUAN_CACHE_DIR` 覆盖。生成文件不提交 Git，可从试搭页“载入 GLB”在浏览器
本地打开。

后端也支持私有媒体、三类资产、SpaceVersion、不可变 DesignRequest、异步
GenerationRun、PlanAsset/PlanVersion、预算/换风格调整、偏好和受控事件。直接以
300 元生成会得到 240 元可执行组合；刷新和重启后仍能读取任务与版本。真实灵感
解析、真实商品接口、候选方案按需生图和预算调整后重绘尚未接入。

完整 `/api/v1` 契约可从 `docs/openapi.yaml` 导入 Apifox/Postman，服务运行后也可
读取 `GET /api/openapi.json`。修改路由或 Schema 后运行
`npm run openapi:generate`，根检查会拒绝未同步的契约。

## 项目结构

```text
apps/douyin-demo/         默认产品前端、同源代理、前端测试与视频素材
apps/web/                 兼容 AICard、Prompt 实验台与独立 Three.js 3D 试搭页
packages/contracts/       AICard v1、/api/v1 Schema、共享路由清单与 OpenAPI 生成器
packages/validation/      预算、安装、结构、尺寸、库存和安全规则
services/orchestrator/    SQLite Repository、领域服务、Workflow、HTTP API 与适配器
examples/                 固定 AICard、8 个输入夹具和一键示例
docs/product-spec.md      产品方案与比赛口径
docs/architecture.md      数据对象、模块边界与演进架构
docs/backend-api.md       后端接口、状态、配置和验证方式
docs/openapi.yaml         可导入 Apifox/Postman 的 OpenAPI 3.1 契约
docs/visual-search-api.md 视频框选、视觉搜索、商品确认、资产与模型版本拟议契约
docs/model-integration.md 模型/Agent/精细图像 API 接入边界
docs/team-roles.md        当前三人团队分工、Prompt/前端/产品并行规则
docs/ai-github-playbook.md 让 AI 完成日常 GitHub 协作的提示词
docs/public-release.md    从私有协作到公开发布的检查表
scripts/                  本地服务器、仓库校验与混元 3D 命令适配器
.github/                  Issue、PR 和 CI 配置
HANDOFF.md                可持续维护的工程交接文档
```

## 成熟度

- 抖音产品前端：可持久联调集成原型；上传、空间确认、设计任务、生成运行、资产
  和方案历史已接 `/api/v1`；视频框选与候选选择可演示，候选当前为明确标注的
  本地 Demo，确认后优先写入真实 ItemAsset。
- 兼容 Web：运行时 Live 集成原型；上传、`generate → revise(300)`、来源状态
  和错误提示已接 AICard API，保存仍只是本地摘要。
- 3D 试搭：运行时静态 MVP；本机混元样例、双模型组合和浏览器保存已完成，图片到
  GLB 目前通过本机命令执行，尚未进入持久任务 API。
- 后端：可持久联调版；默认离线生成，资源、任务和方案可跨重启恢复。
- 下一阶段：补齐账号隔离、资产管理动作与方案修订闭环。
- 尚未实现：生产级账号/限流、真实内容商品、实时 image-to-image、厘米级测量、
  持续视频理解、真实交易和硬装施工建议。

## 团队协作

项目当前由三人共同维护，按“产品与验收、前端体验与实现、后端生图 Prompt 与评测”
划分长期所有权。三条线可以并行，但用户路径、接口协议和发布候选必须共同冻结，
详见 [`docs/team-roles.md`](docs/team-roles.md)。

所有功能通过 Issue 描述验收标准，通过短分支和 Pull Request 合并。`main` 应始终保持可演示。

没有 GitHub 协作经验时，可以直接复制 [`docs/ai-github-playbook.md`](docs/ai-github-playbook.md) 中的提示词，让 AI 完成检查、建分支、修改、测试、提交和创建 PR。

## 开源与数据边界

代码采用 [MIT License](LICENSE)。演示图片和其他素材不自动适用代码许可证，详见 [ASSETS_LICENSE.md](ASSETS_LICENSE.md)。

公开仓库不会包含：

- 访问密钥、平台内部接口或真实用户数据
- 未经授权的达人视频、封面和 Workshop 资料
- 生产排序权重、真实商业数据和内部评测日志

当前页面先在浏览器压缩预览图片，点击生成后以 Data URL 发送给本地兼容接口，
仅用于当次 Agent Plan 空间理解，不通过这条兼容链路持久化。迁到
`/api/v1/media` 后，后端会清理元数据并写入非静态私有目录，以短时签名 URL 访问。
Agent Plan 地址固定为官方 `ark.cn-beijing.volces.com/api/plan/v3`，原图不进入
AICard、事件或日志；页面必须以 `LIVE / FALLBACK / DEMO` 如实标记调用来源。

3D 页面直接载入的 GLB 和预览图片留在用户浏览器；本机混元生成默认离线读取模型
缓存。当前生成 GLB 被 Git 忽略，生产实现必须进入私有对象存储，并在数据库
只保存所有权、来源、尺寸、挂点和组合变换。当前 Hunyuan shape-only 输出没有
纹理；模型与相关素材用于商业场景前必须另行核对其许可证和来源授权。

安全问题请参阅 [SECURITY.md](SECURITY.md)，参与开发请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。
