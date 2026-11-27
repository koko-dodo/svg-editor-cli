# Phase 1 精确回归基线

来源提交：`177eb20e131849132a777ec0ca576c37a5b00728`（final）。Golden 是该提交真实 CLI 执行结果，不是题目示例输出。运行方式为管道输入、非交互模式，故不产生 banner、提示符或命令回显；没有移除或归一化实际输出。交互模式已有 Repl 测试，本基线不替代它。

## 文件

- phase1-section6.txt：原题 §6 的全部命令，顺序不变。
- phase1-version-a.txt：§6.1 手工 Composite 版本 A 的全部命令。
- phase1-compatibility.txt：补充 help、六种类型、错误、canvas、路径及屏障检查；不是原题会话。
- ../../tests/fixtures/phase1/other.svg：原题 §6 独立外部 SVG。
- golden/provenance.json：来源 SHA、运行条件、源文件及输入 SHA256。
- golden/每个会话/：stdout.txt、stderr.txt、exit-code.txt 和生成的 SVG。exit-code.txt 是十进制退出码加 LF。
- box-version-b.txt：§6.1 B 全命令，**尚未启用验收**。
- box-version-b.assignment.txt：题目 B 的原始示例会话摘录，含题目输出/提示符，**不是执行输入或真实结果**。没有为 B 生成 Golden。

原题示例中的树对齐空格及版本 A 的 line 样式显示与 final 不完全一致；本基线记录 final 实际行为，不据此断言它与题目完全相符。默认保存路径的成功输出会包含 readPath 的绝对临时路径，因此补充会话不对该非稳定输出做 Golden；原有 EditorIO.test.ts 仍覆盖默认路径行为。

## 验证（不会改写预期）

```sh
node tests/regression/phase1-baseline.cjs
npm run build
npm test
```

每个会话创建独立 mkdtemp 工作目录，复制 other.svg；使用固定相对命令路径，stdio 为 Buffer，逐字节比较 stdout、stderr、退出码、指定保存文件。finally 仅清理该新建目录，不覆盖用户已有文件。负向测试证明空格、换行、错误流、退出码及 SVG 差异会被拒绝。普通测试失败绝不会采集或改写 Golden。

SVG_BASELINE_CLI_JSON 可指定未来 Phase 2 的完整 argv JSON（不经 shell），用于禁用全部新增插件后的真实入口；其中入口和配置应使用绝对路径，因为子进程 cwd 是隔离目录。默认使用 Node --import tsx src/main.ts。不能将 B 会话加入当前 Phase 1 必过列表。

## 来源与独立复现

首次显式采集：`node tests/regression/phase1-baseline.cjs --capture-final`。它要求 HEAD/final 均为来源 SHA、运行源码/package/锁/tsconfig字节等于Git来源，并拒绝覆盖已有golden目录。此入口是显式采集操作，不能作为失败测试的自动修复。后续不应刷新已审查的基线来接受回归。

不切分支、不动tag的独立复现步骤：

1. 开发者在独立临时目录用只读 `git archive 177eb20e131849132a777ec0ca576c37a5b00728` 导出原版本。
2. 使用来源 Node/锁定依赖；可把原仓库已核实的 node_modules 链接到导出目录（不是 Git 写操作）。不把当前 Phase2源码复制进去。
3. 在本仓库执行 `SVG_BASELINE_SOURCE_ROOT=/绝对路径/导出目录 node tests/regression/phase1-baseline.cjs`。脚本仍读取本仓库输入/Golden，运行导出的 final 入口，实际 cwd 仍是新临时目录。
4. 检查三会话输出 PASS。与当前 HEAD 对比或 A/B 使用同一验证器，不做 trim、空白压缩、路径替换或输出归一化。

依赖入口解析取本仓库锁定工具链；来源元数据见 provenance。Node版本差异需要先报告，不应直接更新Golden。原始需求只存本地process，不是运行测试所需依赖；开发者需正常提交本目录、夹具和验证代码。
