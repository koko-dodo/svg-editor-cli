# Git 历史指标口径

本目录按 Phase 2 原文 §7 的明确路径 `docs/metrics/` 建立。正式项目说明仍在 `doc/README.md`，不在此复制第二份正式 README。这里只保存指标、冻结范围及其复现工具。

## 运行

在仓库根目录使用已有 Node/TypeScript 依赖，无需安装工具：

```sh
node docs/metrics/collect.mjs --base final --target HEAD
# 仅建立冻结候选范围时显式附加；普通指标重算不覆盖冻结记录：
node docs/metrics/collect.mjs --base final --target HEAD --freeze-scope
# 最终 p2 由开发者创建后，再按原文计算最终增量：
node docs/metrics/collect.mjs --base final --target p2
```

可用 `--out <独立目录>` 重算和比较结果，避免覆盖现有证据。脚本只执行 Git 的 rev-parse、ls-tree、show，不切换分支，不修改索引、提交或标签；失败引用不会生成伪造数据。两端均读取明确 commit 的 blob，不读取工作区源码。当前快照指向 R5 提交的运行代码；本阶段没有改动运行源码，所以它也准确表示当前冻结候选的运行代码，不包含未提交的测试和本指标工具。

`metrics.json` 保存完整 SHA、逐文件 Git blob、分类/职责、行数、函数位置及复杂度、汇总和增量。`report.md` 是同一数据自动生成的可读表。无时间戳、随机路径或手填指标；同样的两端和同版分析器应逐字节一致。`freeze-scope.json` 仅在显式参数下生成，列出候选冻结源码和插件元数据；它不是人工批准或已存在的冻结提交。冻结规则见 [FREEZE.md](FREEZE.md)。

## 分类与文件清单

- kernel：`src/` 下除宿主以外的运行源码，含公开 API、领域、历史、CLI、IO 和通用注册表。
- host：`src/main.ts`、`src/host/`，包括组合根和通用加载器。
- plugins：`plugins/` 内运行源码。
- vscode：仅 `vscode-extension/src/`，单独统计，永不加进 CLI 总数。
- CLI 总数 = kernel + host + plugins；同一规则同时应用于 final 和目标提交。Phase 1 中原内置类型和命令尚在 src，所以属于当时 kernel，不把其历史代码追溯改分类为插件。
- 纳入 `.ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs`，排除声明文件、`*.test.*`/`*.spec.*` 测试源码（.test/.spec后缀）、tests/test/fixtures、node_modules、dist/out/coverage，以及文档、生成报告、锁文件和数据配置。清单与职责覆盖实际计量的运行源文件。包 manifest 不算代码行，但属于冻结范围清单。

## 行数

同时输出物理行数 lines、非空行数 nonblank、源代码行数 sloc；最终换行不额外增加一行，CRLF/LF 等价。SLOC 包含类型声明、导入和仅有标点的语法行，排除纯空白/纯注释行；代码与注释共存仍计一行。多行字符串/模板的非空内容也算代码。

使用当前 TypeScript 7.0.2 的 native AST 和词法 scanner：先用 AST 标记字符串、模板片段和正则字面量，再扫描真实注释。不会把字符串中的 `//`、`/*`、`if` 等误算为注释或分支。不是按代码关键字正则估算圈复杂度。口径测试覆盖注释、模板、正则、类型接口和嵌套函数。

## 圈复杂度

采用明确的 McCabe 源级变体，对每个有函数体的函数/箭头/方法/构造器/getter/setter计入口 1，再为以下节点各加 1：

- if、for/for-in/for-of、while/do、catch、三元表达式；
- 每个非 default case；
- `&&`、`||`、`??` 及其逻辑赋值形式。

else、default、try/finally、return、可选链和类型条件不另加；默认参数不单独加分支。嵌套函数各自计入口和分支，不重复计到外层。类字段初始化等函数外决策计入模块作用域。具有运行语句/运行声明的模块入口为 1，纯类型模块为 0。

输出 ccFunctions（函数和）、ccModule（模块入口及函数外分支）、cc（两者和）、maxFunctionCC 和每作用域明细。这是可复现的静态源级变体，不声称与未指定工具的所有口径相同；两端使用完全相同的规则，增量为 target − final。代码迁出内核不必导致总行数/总复杂度下降，报表如实呈现，不按预期美化数字。

## 当前限制

分析器绑定仓库已有 TypeScript 版本；升级分析器时须同时重算两端，不把不同口径结果混比。当前范围不含第三方依赖、测试、构建产物或动态生成代码；本阶段不是最终 p2 结果，也不是正式插件零修改证明。
