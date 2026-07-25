# 第一链路完整敏感交接包清单

> 本文随完整敏感交接包提供。交接包包含可用 API Key、用户图片、本地数据库和
> 私有媒体，不得上传公共网盘、公共 Git 仓库、Issue、聊天群或未经授权的平台。

## 包含范围

- 项目目录完整快照：
  - `.git`
  - `.github`
  - `node_modules`
  - 全部源码、测试、示例和文档
  - `.env.local`、`.env.example`
  - 顶层与 `data` 运行日志
  - SQLite、WAL、SHM
  - `data/private-media` 中现存的上传图片和真实生成资产
  - 既有 `artifacts`
- 项目外输入证据：
  - `OIP-C.webp`
  - 本轮四张 Prompt 实验台前后结果/失败截图
- 第一链路 Prompt 工程总交接：
  - `docs/first-workflow-prompt-engineering-handoff.md`

## 无法恢复的内容

Prompt 实验台按设计不持久化原图、LayoutPlan、ProductSlot、Seedream Base64
响应和结果图。已经完成且未点击下载的原始响应正文无法从后端恢复。交接包包含：

- 当前 `data/private-media` 中正式链路曾持久化的真实图片；
- 本轮保存在系统临时目录中的结果截图；
- 可复现当前调用的 Prompt、代码、模型配置、数据库和日志。

截图不是原始模型响应文件，不能替代后续正式的 EvaluationRun 资产保存。

## 交接安全

- ZIP 未加密；
- 包内 `.env.local` 可能包含仍有效的 API Key；
- 接收人应在受控设备上解压；
- 交接完成后建议轮换 API Key；
- 不要把带 Key 的 ZIP 提交进 Git；
- 若需要公网传输，应在外部使用强密码加密，并通过不同渠道传递密码。

## 接收方使用

在 Windows 环境解压后，从项目根目录运行：

```powershell
npm.cmd run check
npm.cmd run start:classic
```

然后打开 `http://127.0.0.1:8765/prompt-lab.html`。若端口被占用，以启动器输出的
实际地址为准。压缩包包含当前 Windows 依赖，因此同类环境无需先安装依赖；macOS、
Linux 或 Node 原生模块 ABI 不兼容时，应删除 `node_modules` 后重新安装依赖。

能否调用真实模型仍取决于交接时 API Key 是否有效、账户额度、供应商权限和网络状态。
当前交付是第一链路 Prompt 工程实验与开发环境，不是生产部署包。
