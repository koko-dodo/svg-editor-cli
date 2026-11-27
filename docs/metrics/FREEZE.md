# 冻结候选与后续差异证明

当前真实冻结提交F为 `3001b314a370a2df86f9ac476be9b54e0358e3b1`（kernel-freeze），已经由开发者验收、创建标签并完成重构分支合并。原始冻结候选源树为 `da65fd1855a0cc9f3145cf05e7095289be7b7e1b`；freeze-scope.json保留该历史树的真实路径/blob及candidate状态，不覆盖原始记录。

此后正式插件配置接入的零修改证明及真实A/B独立演示提交见[实际提交报告](../../doc/evidence/assembly/committed-result.json)。A为20aeb40775c0e20f3849f86b6b31c07f7fe35b64，B为fc3c944d47e337a3a8becac75131b14b2406ad98，父提交均为F。最终候选功能验收与限制以[正式说明](../../doc/README.md)为准。

## 冻结范围

- 内核及公开 API：`src/api/`、`src/model/`、`src/commands/`、`src/services/`、`src/extensions/`、`src/cli/`、`src/io/`。
- 通用加载器：`src/host/loading/`。
- 启动入口：`src/main.ts`。
- 组合根：`src/host/composition.ts`，仅方式 A 允许新增插件装配；不得借此改内核/加载器规则。
- 既有插件：当次接入前已存在的整个 `plugins/` 包及其 manifest。不能只检查本文件最初列出的两个默认包而漏掉后来已接入的插件。
- 原有 Golden、行为测试及根工具链继续受保护。必要测试、正式文档、配置/依赖元数据按原文单独说明，不能用元数据变化隐藏运行修改。

兼容字段 type、旧 flat create 请求 type 和 show 的非枚举语义元数据保留：它们支持原有服务/视图和类型回归；真实语义分派使用 kind，移除会造成无收益破坏。既有插件内 legacy ShapeFactory/ShapeSchema 兼容入口不作为新插件依赖或类名分派依据。

## 已解决的依赖约束冲突

人工在本轮明确授权修正 `tests/contracts/Architecture.test.ts`：允许同时满足 `node:` 前缀和 `node:module.isBuiltin` 验证的 Node 内建模块；继续禁止内核私有实现、宿主、其他插件及未授权第三方/裸模块导入。修正原因是原检查会错误阻止后续 dir 的独立文件系统适配器导入 `node:fs`，不属于允许插件访问内核私有实现。

已补内建子路径/公开入口/本包正例，伪造内建/裸 fs/第三方/内核私有/宿主/其他插件/归一化越界反例，以及 import/export/require/dynamic import 形式检查。保留原全目录依赖扫描和 model→api 类型专用规则。本轮没有修改运行源码或扩展契约。

## 每次接入的 Git 证据

以下命令仅供只读核查；F、C 由开发者实际提交后以完整 SHA 替换。C 是本次插件接入提交，其父 C^ 是当次已有插件集合，而非始终使用最初 F。

先核验路径确实存在，避免不存在路径造成空 diff 假阳性：

```sh
git rev-parse --verify F^{commit}
git rev-parse --verify C^{commit}
git ls-tree -r --name-only C^ -- src plugins
git ls-tree -r --name-only C -- plugins/new-plugin
git diff --name-status C^ C
```

方式 A 的既有运行修改只能是 `src/host/composition.ts`：

```sh
git diff --exit-code C^ C -- src ':(exclude)src/host/composition.ts'
git diff C^ C -- src/host/composition.ts
git diff --exit-code C^ C -- plugins ':(exclude)plugins/new-plugin/**'
```

方式 B 的所有既有运行源码差异必须为空，配置可变：

```sh
git diff --exit-code C^ C -- src
git diff --exit-code C^ C -- plugins ':(exclude)plugins/new-plugin/**'
git diff C^ C -- plugins.config.json
```

两种方式都要从完整 name-status 逐项说明测试、文档和元数据；单独核验 `src/host/loading/` 与 `src/cli/Formatter.ts` 无修改。可以再从 F 到当前累积核对冻结核心，但不能以累积差异代替每个接入提交的证明。A/B 必须保持插件集合、注册顺序、options、输入文件和 cwd 相同，分别比较原始 stdout、stderr、退出码及保存文件；dir 会话使用固定目录，日志在目录之外。

发现必需能力不足时先报告并撤回冻结结论，重新人工审查和建立新 F，不在具体插件提交中修改框架后仍声称零修改。

## 冻结时自动验收记录（历史）

类型检查、35测试文件776项（原751保留＋本轮25）及三份原始Golden通过。完整依赖扫描、四扩展真实路径及新双必要部件/注入适配器/保存点比较契约通过。上述依赖冲突已按人工授权修正，未发现当前必做能力的关键冻结阻塞；没有修改运行源码或工具链。以上是冻结前当时的结果；随后人工验收、真实F及正式插件A/B证明已经完成，当前状态见本文开头及正式说明。

## box 冻结时局部业务建议（历史）

后续正式插件可考虑：文字位置使用与示例相容的固定偏移（如x+20、y+35）作为候选，矩形默认填充以原文示例#4a90d9为候选；在正式box任务中审查后确定，不从当前测试坐标推定最终公式。建议允许额外节点和嵌套；只把必要部件的存在、ID/kind及直接父级作为最低结构不变量。直接编辑部件属性和重排原则上允许，若需限制视觉层叠或几何关系，再由box的纯validate明确约束。以上都可在插件内部实现，不要求改冻结内核；当前audit-pair的同坐标探针不是box产品语义。


后续box已采用固定文字偏移、默认蓝色及最小结构限制；实际实现与边界见[box说明](../../plugins/shape-box/README.md)，不以历史建议替代产品行为。
