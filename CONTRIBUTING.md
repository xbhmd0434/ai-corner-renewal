# 参与贡献

感谢参与 AI 一角焕新。

## 开始之前

1. 先阅读 `README.md`、`HANDOFF.md` 和 `docs/architecture.md`。
2. 功能开发前创建 Issue，写明用户问题、范围外事项和验收标准。
3. 如果修改数据用途、素材来源或抖音生态表述，必须标记隐私/版权影响。

## 开发

```bash
npm run check
npm run start:web
npm run start:backend
npm run demo:backend
```

从最新 `main` 创建短分支：

```text
feature/<description>
fix/<description>
docs/<description>
```

## 提交

推荐使用简洁的祈使式提交信息：

```text
add douyin-native result flow
define room profile schema
fix mobile plan comparison
```

## Pull Request

PR 必须说明：

- 改了什么以及为什么。
- 用户或开发者会看到什么变化。
- 如何验证。
- 是否修改对象模型、数据来源、隐私或素材。
- 截图或录屏。
- 回滚方法。

跨模块改动需要对应所有者 Review。合并前必须通过 CI，并同步更新 `HANDOFF.md` 的持久章节。

## 不接受

- 真实访问密钥、用户数据或内部日志。
- 未经授权的达人视频、Workshop 内容和商品数据。
- 把模拟数据描述成真实平台能力。
- 仅追求效果图而忽略预算、尺寸和结构一致性的改动。
