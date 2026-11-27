# SVG Outline Lab

独立的 TypeScript/CommonJS VSCode 扩展：Explorer 中 SVG 文件显示 `[]`，原生 Outline 显示 XML 元素层级并定位源码。CLI 源码和领域 Reader 不参与扩展。

## macOS 启动

1. 使用 VSCode **1.85.0 或更高的 1.x 版本**。本扩展按 `@types/vscode 1.85.0` API 编译；已由开发者在 macOS 真实 Extension Development Host 完成本文所列功能验收；具体 VSCode/macOS 版本号尚未提供，最低兼容版本来自 API 声明，不代表已实测所有版本。
2. 在 Terminal 进入本仓库的 `vscode-extension` 目录。使用 Node.js 24（本次自动化环境）和 npm，执行 `npm ci`、`npm test`。不要在根项目安装扩展依赖。
3. VSCode 选择 **File → Open Folder…**，只打开 `vscode-extension` 文件夹；不是打开整个父仓库。首次打开时可先观察原生 Explorer/Outline 的原有表现，记录其他 XML/SVG 扩展情况。
4. 打开 **Run and Debug**，选择 **Run SVG Outline Lab**，按 F5（macOS 可用 Fn+F5）。preLaunchTask 会执行 `npm run build`，然后启动 Extension Development Host，并打开 `fixtures`。
5. 先不打开 SVG，确认 Explorer 的 `example.svg` 旁出现 `[]`；`plain.txt` 和 `folder.svg` 目录无标记。
6. 打开 `example.svg`，展开 Explorer 下方原生 **Outline**；点击 `rect#start`、`g#nested`、无 ID 的 circle/tspan 等，检查源码定位。可使用 View → Open View… → Outline 找到原生视图。
7. 插入空行、修改 ID、增删元素，检查大纲更新；暂时删去闭合标签时允许空大纲，修复后恢复。
8. 停止调试关闭 Host；再次 F5 可重建和重启。无需打包器或安装到 Marketplace。

SVG 可能默认由 **Image Preview** 打开；DocumentSymbolProvider 需要 **Text Editor** 模式。右击文件或标签选择 **Open With... → Text Editor**，再查看原生 Outline。Git 自带的 `U`、`M` 等装饰可能与 `[]` 同时出现；演示时可临时将 `git.decorations.enabled` 设为 `false`，但不要关闭 Explorer 的全部 badges，否则也会隐藏本扩展标记。此处仅说明手动操作，本任务未修改用户设置。

若 Outline 被其他 SVG/XML 扩展的 Provider 接管，请在调试 Host 的扩展面板中禁用冲突扩展后重试，并记录环境。启动失败可查看 Debug Console 和 Host 的 Output → Log (Extension Host)。

## 实现与边界

- `onStartupFinished` 激活，不要求先打开 SVG；`activate()` 注册 FileDecorationProvider 和 DocumentSymbolProvider。宿主负责展示 Explorer/Outline、请求服务、编辑后重新请求、按范围导航；扩展负责返回装饰及符号。
- 文件标记检查 `.svg` 后缀（大小写不敏感），再调用 `workspace.fs.stat`，必须为文件且非目录；不存在或取消返回空。只读查询不改名、不写内容。watcher 和 rename 事件刷新装饰（包括父目录重命名），没有索引或持久缓存；所有监听/注册通过 Disposable 释放。
- Outline 适用 `.svg`、`.SVG` 路径，不绑定某个第三方语言 ID。saxes 负责 XML 合法性、命名空间和嵌套；无 ID 不补 ID，保留 path/defs/tspan/未知标签。根元素需为 svg，允许带前缀；拒绝 DTD，非法/不完整输入整体返回空结果。
- `XmlOutlineParser` 不使用正则解析 XML。按代码点给 saxes 输入，同时按原始 JS 字符串长度累计 UTF-16 偏移；在 opentagstart 记录实际 `<`，closetag 记录已消费边界（包括自闭合）。不使用 saxes.column 当 VSCode character，不重新序列化来估计位置。
- `range` 覆盖完整元素，`selectionRange` 只覆盖开始标签名；`document.positionAt` 转换 UTF-16 偏移，中文/emoji、LF/CRLF、CDATA、多行属性均自动化验证。每次请求新建解析器，不缓存失效树；检查取消及文档版本。
- 单次解析为线性遍历；逐代码点输入比整块解析有额外调用成本。当前不实现增量解析、SVG规范校验或预览，大文件性能需真实环境观察。

## 依赖和测试

运行依赖仅 saxes（XML 解析，连带 xmlchars）；开发依赖为 TypeScript 和 VSCode 类型声明。VSCode API 运行时由宿主提供，不安装 `vscode` npm 运行包。保留 CommonJS；扩展独立锁文件，不改变根项目工具链。

- `npm run build`：编译 `src` 到 `out`，源码映射支持调试。
- `npm test`：先编译，再用 Node 内置 test runner 执行 `test/*.check.cjs`，无需新增测试框架。
- `test/parser.check.cjs`：纯解析、原始偏移及异常恢复测试。
- `test/api.check.cjs`：**模拟 VSCode API 契约测试**，检查装饰、监听释放、DocumentSymbol、注册、manifest/launch。它不是运行真实 VSCode API 或 UI 的证据。
- 真实 macOS Host 功能验收已由开发者完成，结果见下节；自动化测试与人工证据分开记录。大文件性能及全面第三方 Provider 兼容性未测试。

`node_modules/`、`out/`、覆盖率和测试缓存在扩展本地 `.gitignore` 排除。Git 不保存空目录，因此 `fixtures/folder.svg/README.txt` 保证目录负例存在。

## 模式与复用分析

FileDecorationProvider 通过宿主注册的接口提供额外界面信息，具有组合和装饰效果，但没有包装 Explorer 对象、实现同一组件接口再委托，因此不能仅凭名字等同 GoF Decorator。

SvgDocumentSymbolProvider 把独立 XML 范围树转换成宿主 DocumentSymbol，充当 Adapter：源数据是 OutlineElement，目标接口为 DocumentSymbolProvider，VSCode 是客户端。文件状态到 FileDecoration 也有适配含义。

Phase 1 的 SvgReader 依赖有限 schema/模型，拒绝未知标签、自动生成 ID、要求几何属性，且不提供元素范围；模型遍历处理图形领域树而非编辑中的源码。直接复用会破坏普通 SVG 大纲需要或改变 CLI 行为。因此复用 saxes 的技术选型，独立解析/遍历，无 CLI Reader/模型依赖。

参考：[VSCode API](https://code.visualstudio.com/api/references/vscode-api)、[激活事件](https://code.visualstudio.com/api/references/activation-events)、[程序化语言能力](https://code.visualstudio.com/api/language-extensions/programmatic-language-features)。以下证据来自开发者真实运行，不以题目截图或模拟测试冒充；原图归档状态单独注明。


## 真实人工验收与截图

开发者确认以下12项全部通过，未发现功能缺陷：Host启动；SVG显示[]；普通文件/目录.svg排除；未打开SVG时已标记；原生Outline根；嵌套及有/无ID命名；defs/linearGradient/stop/path/tspan；中文emoji后tspan定位；未保存circle改ID实时更新；删根闭合标签空大纲且编辑器正常；修复后恢复；创建/正反重命名/删除刷新。

消息中七张截图的可见内容及顺序已经核对。开发者提供本地原图后，已逐张核验并原样归档；[证据索引及SHA256](../doc/evidence/vscode/README.md)记录原文件映射和字节一致性。 原图只复制和重命名，不裁剪、不编辑、不生成替代图。正式证据目录为 `doc/`，不是 `docs/`。

| 顺序 | 原图归档引用 | 可见内容 |
|---|---|---|
| 1 | [01-file-decoration.png](../doc/evidence/vscode/01-file-decoration.png) | Welcome页未打开SVG，example.svg有[]，plain.txt及folder.svg目录无标记 |
| 2 | [02-outline-navigation.png](../doc/evidence/vscode/02-outline-navigation.png) | 原生Outline根/嵌套/非内置元素，tspan选中并定位至中文emoji后的标签 |
| 3 | [03-outline-live-update.png](../doc/evidence/vscode/03-outline-live-update.png) | 未保存圆点与circle#test-circle实时更新 |
| 4 | [04-invalid-xml.png](../doc/evidence/vscode/04-invalid-xml.png) | 删除根闭合标签，Outline显示No symbols found |
| 5 | [05-xml-recovery.png](../doc/evidence/vscode/05-xml-recovery.png) | 恢复闭合标签，Outline重新显示层级 |
| 6 | [06-decoration-create.png](../doc/evidence/vscode/06-decoration-create.png) | refresh-test.svg创建后出现[] |
| 7 | [07-decoration-rename.png](../doc/evidence/vscode/07-decoration-rename.png) | 改名refresh-test.txt后[]消失 |

SVG→TXT有截图；TXT→SVG及删除由开发者确认通过，没有宣称对应独立截图。截图中的临时编辑不作为最终示例；磁盘example.svg已恢复原始示例，无refresh-test.svg/txt遗留。验收是功能场景验证，不代表大文件性能、全平台或全部第三方Provider组合兼容。
