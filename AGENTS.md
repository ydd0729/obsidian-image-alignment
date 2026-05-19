# 项目维护说明

本文件只记录 `image-alignment` 仓库特有、下次继续维护时容易忘的信息。通用 Obsidian 插件开发、GitHub release、Git 操作规范优先看全局 skill。

## 项目元数据

- 插件 id：`image-alignment`
- GitHub repo：`ydd0729/obsidian-image-alignment`
- 作者名：`Dong Yang`，不要写成 `yd`。
- `manifest.json.version`、`package.json.version` 和 Git tag 必须保持一致。

## 发布方式

本仓库已经使用 `.github/workflows/release.yml` 自动正式发布。

- 本地不要运行 `gh release create`。
- 发布时只需要 bump 版本、更新 `CHANGELOG.md`、构建、提交、push main，然后 push annotated tag。
- workflow 会从 `CHANGELOG.md` 的 `## <tag>` section 提取 release notes；没有对应 section 会失败。
- 之前混用手动 release 和 workflow release 产生过 `untagged-*` draft，后续如果再出现重复 draft，优先检查 workflow，不要只手动删除 draft。

## 样式实现取舍

当前 `styles.css` 保持纯 CSS 实现，不使用 JS 同步对齐 class。

- Live Preview 需要对齐 `.cm-embed-block`，但对齐信息在子元素 `.image-embed[alt=...]` 上。
- 因此这里使用窄作用域 `:has()`：`.markdown-source-view.mod-cm6.is-live-preview .cm-embed-block:has(.image-embed...)`。
- 这个 block 内通常只有一个 image embed，实际性能风险很低；不要为了机械消除 `:has()` 引入 `MutationObserver` 或复杂 class 同步。
- alt token selector 写成 `[alt="center"]`、`[alt^="center|"]`、`[alt$="|center"]`、`[alt*="|center|"]` 是为了按 `|` 分隔 token 精确匹配，避免 `[alt*="center"]` 误匹配。

## 行为约定

- 插件语言自动跟随 Obsidian 语言，不提供手动语言设置。
- 中文判断逻辑：`getLanguage().toLowerCase().startsWith("zh")`。
- 其它语言回退英文。
- 用户选择的对齐等于默认对齐时，插件会移除显式 alignment token，让 CSS 默认对齐生效。
- 修改图片对齐时要保留已有尺寸 token，例如 `|300`、`|500x300`。
