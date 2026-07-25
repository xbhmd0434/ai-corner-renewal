抖音展示 Demo × AI 一角焕新
=============================

当前成熟度
----------
- 抖音推荐流与个人页：运行时静态 Demo。
- renewal.html：已接通仓内 ai-corner-renewal `/api/v1` 的可持久联调原型。
- 旧 me.js 空间活动层：仍是 Mock 源码，但已退出“+”主路径。

一键运行
--------
要求 Node.js >= 22.5，推荐 Node 24。首次克隆需要 npm install。

在 GitHub 仓库根目录执行：

  npm.cmd install
  npm.cmd start

浏览器打开：

  http://127.0.0.1:8765/douyin-static-demo/index.html

该命令会同时启动：
- 前端静态服务：http://127.0.0.1:8765
- 后端 API：http://127.0.0.1:8787
- 同源代理：http://127.0.0.1:8765/api/*

若后端已经单独运行，只执行：

  npm.cmd run start:douyin-web

不要用 file:// 或旧 Live Server 5501 验收联网功能。

已接通流程
----------
1. 视频右侧“焕新”保存最小视频上下文，创建 temporary Inspiration Asset。
2. 选择后端已有空间，或上传 JPEG / PNG / WebP。
3. 上传进入 private media，随后创建 Space Asset。
4. 查看解析结果并由用户确认，封存 SpaceVersion。
5. 填写目标、预算、不打孔和宠物环境，创建不可变 DesignRequest。
6. 轮询 GenerationRun，成功后读取持久 PlanVersion。
7. 展示前后图、候选商品、执行步骤与后端规则校验。
8. 资产和方案历史刷新后仍从后端恢复。

主要入口
--------
- 推荐流：douyin-static-demo/index.html
- 个人页：douyin-static-demo/me.html
- 焕新首页：douyin-static-demo/renewal.html#/home
- 资产中心：douyin-static-demo/renewal.html#/assets
- 空间上传：douyin-static-demo/renewal.html#/spaces/new
- 任务装配：douyin-static-demo/renewal.html#/task
- 方案历史：douyin-static-demo/renewal.html#/plans

验证
----
  npm.cmd run check:douyin
  npm.cmd run check:douyin-integration

`check` 运行语法检查和 46 项前端纯逻辑测试。
`check:integration` 使用临时 SQLite 跑通：

  upload -> asset -> seal -> DesignRequest -> GenerationRun -> PlanVersion

它不会读写正式 data。

当前限制
--------
- 视频入口只保存元数据，尚未上传用户确认的代表帧或圈选框。
- 资产重命名/保存/归档/删除/重试尚无完整 UI。
- 方案降预算、换风格、版本切换和失败重试尚未开放。
- API 完全不可用时只有明确离线提示，尚无主动本地 fixture 按钮。
- 商品、库存和教程仍是后端明确标注的 Demo 数据，不是真实抖音接口。
- 固定 Demo actor 只适合受控联调，不是生产鉴权。

详细对象边界、状态机、隐私约束和下一步见项目根目录 HANDOFF.md。
