# 正式插件双装配验收

运行证据与 Git 提交证明分开保存。`isolated-result.json` 记录真实执行结果，来源是其中标注的 HEAD；它不是 A/B 演示提交，也不声称已经创建演示分支。当前实际历史中的配置接入提交及其完整 name-status、前序运行文件不变核验见该 JSON 的 `frozen.pluginHistory`。内核冻结提交 F 为 `3001b314a370a2df86f9ac476be9b54e0358e3b1`。

## 重复运行

仓库及 VSCode 扩展已有开发依赖须已安装（本验收不安装依赖）：

```sh
npm run build
npm test
node tests/regression/phase1-baseline.cjs
node tests/acceptance/assembly.cjs
git diff --check
```

脚本默认仅验证，禁止自动更新预期。`--capture` 是显式首次采集入口，目标目录存在就拒绝，不可用来掩盖回归。预期由真实代码装配进程采集，随后配置装配逐字节校验；不是题目示例的手工转录。普通测试不传 capture。

脚本用只读 `git archive` 导出 A/B/final 到独立临时目录。A 仅在导出副本的组合根应用 `tests/acceptance/code-assembly.patch`，通过静态 import 和 `PluginInstaller.installCode` 安装四包；B 不改运行源码，读取配置。两者均走既有 install → Registry 暂存、manifest 校验、原子提交路径。A/B 都通过类型检查，未改工作区冻结运行代码。临时目录 finally 清理。

插件顺序固定为 stats、dir、box、modified-star，options 全为 `{}`。B 使用 `doc/transcript/acceptance/plugins-ab.config.json` 复制为隔离副本根配置，保持相对包路径解析。两边每次使用**同一个绝对 cwd**，运行前重置：三个目录 `.hidden-dir`、`A-dir`、`z-dir`，三个文本文件 `.hidden`、`A.txt`、`z.txt` 及既有 `other.svg` 夹具。日志、配置和预期保存在 cwd 之外。环境固定 TZ=UTC、LANG/LC_ALL=C、NO_COLOR=1、FORCE_COLOR=0、TSX_DISABLE_CACHE=1；启动入口为真实 main.ts，非交互管道输入，无归一化。

| 会话 | 输入（复用已有文件） | 预期及校验 |
|---|---|---|
| Phase 1 §6 | `../../transcript/phase1-section6.txt` | `../../transcript/acceptance/expected/section6/`：stdout、stderr、退出码；demo.svg复用原 `../../transcript/golden/phase1-section6/demo.svg` |
| Phase 1 §6.1 B | `../../transcript/box-version-b.txt` | `../../transcript/acceptance/expected/box/`：stdout、stderr、退出码、flowchart-box.svg |
| 新增命令及标签 | `../../transcript/acceptance/commands.txt` | `../../transcript/acceptance/expected/commands/`：stdout、stderr、退出码、stats.svg；dir排序含隐藏项、stats顺序和不消耗undo、保存后编辑及撤销清星 |
| 禁用兼容 | 原三个Golden输入 | B配置所有新增插件enabled:false，与实际导出final执行比较stdout/stderr/退出码/保存文件，再与原Golden比较 |

错误会话本来包含预期 stderr（例如 stats 在 init 之前），脚本单独比较原始 stderr，不要求其为空。box 会话含 `g#n1 (box) *`，同时验证标签注册顺序。全插件开启的§6树有星号，不能拿无标签final输出当作它的预期；禁用兼容才与final逐字节相同。

冻结核验包括：F的真实路径/blob存在、src完整路径集合及字节不变、默认插件全部不变；逐个后续插件提交核验其父提交的src及既有插件，不允许在旧插件包内新增文件蒙混过关；当前src/plugins工作区blob及未跟踪路径额外检查。

## 已完成的真实 A/B 演示提交

[committed-result.json](committed-result.json)已记录实际验证：A=20aeb40775c0e20f3849f86b6b31c07f7fe35b64，B=fc3c944d47e337a3a8becac75131b14b2406ad98。两者父提交均为F，真实运行及差异检查通过，分支已由开发者推送。下文保留建立证据的可重复步骤，不表示仍待执行，也不应重复覆盖已存在分支。

### 建立演示提交的方法

以下步骤当时由开发者执行；Codex未执行任何Git写操作。两条独立分支都从F出发，使用同一来源提交的全部四包；将“四个正式插件整体接入”视为一次演示提交 C。A只新增四包并改一个组合根；B只新增同样四包及配置。已有逐插件B提交仍保留，演示不重写它们。无需合并演示分支，不移动final/kernel-freeze，不打p2。

先人工审查并提交本轮证据，再在当前仓库根目录由开发者逐段执行。分支名若已存在，停止检查，不用 `-B` 覆盖：

```sh
repo=$(pwd -P)
plugin_source=97b8e97ddd080b3e6bcc29b2033bae60e0d81a0a
freeze=3001b314a370a2df86f9ac476be9b54e0358e3b1
demo_root=$(mktemp -d "${TMPDIR:-/tmp}/svg-ab-worktrees.XXXXXX")
git rev-parse --verify "$plugin_source^{commit}"
git rev-parse --verify "$freeze^{commit}"

git worktree add -b demo/phase2-code-assembly "$demo_root/A" "$freeze"
git archive "$plugin_source" plugins/command-stats plugins/command-dir plugins/shape-box plugins/tree-star | tar -xf - -C "$demo_root/A"
git -C "$demo_root/A" apply --unidiff-zero "$repo/tests/acceptance/code-assembly.patch"
git -C "$demo_root/A" diff --check
git -C "$demo_root/A" add -- src/host/composition.ts plugins/command-stats plugins/command-dir plugins/shape-box plugins/tree-star
git -C "$demo_root/A" diff --cached --name-status
git -C "$demo_root/A" diff --cached
# 人工审查完整staged diff后执行：
git -C "$demo_root/A" commit -m "demo: assemble formal plugins in composition root"

git worktree add -b demo/phase2-config-assembly "$demo_root/B" "$freeze"
git archive "$plugin_source" plugins/command-stats plugins/command-dir plugins/shape-box plugins/tree-star | tar -xf - -C "$demo_root/B"
cp "$repo/doc/transcript/acceptance/plugins-ab.config.json" "$demo_root/B/plugins.config.json"
git -C "$demo_root/B" diff --check
git -C "$demo_root/B" add -- plugins.config.json plugins/command-stats plugins/command-dir plugins/shape-box plugins/tree-star
git -C "$demo_root/B" diff --cached --name-status
git -C "$demo_root/B" diff --cached
# 人工审查完整staged diff后执行：
git -C "$demo_root/B" commit -m "demo: assemble identical formal plugins through configuration"
```

不在演示工作树安装或提交node_modules。实际提交完成后，在原仓库运行（复用已有依赖；脚本再导出这两个真实提交，并编译、运行及校验）：

```sh
node tests/acceptance/assembly.cjs --a-ref demo/phase2-code-assembly --b-ref demo/phase2-config-assembly --report doc/evidence/assembly/committed-result.json

git diff --name-status demo/phase2-code-assembly^ demo/phase2-code-assembly
git diff --exit-code demo/phase2-code-assembly^ demo/phase2-code-assembly -- src ':(exclude)src/host/composition.ts'
git diff --name-status demo/phase2-config-assembly^ demo/phase2-config-assembly
git diff --exit-code demo/phase2-config-assembly^ demo/phase2-config-assembly -- src
git diff --exit-code kernel-freeze HEAD -- src plugins/builtin-shapes plugins/builtin-commands
git ls-tree -r --name-only kernel-freeze -- src plugins
```

脚本的真实ref模式会要求C^确实是F，核验旧运行文件及新增路径，逐字节核验两提交插件代码等于当前正式插件、核验B配置、编译并重跑全部会话，将真实SHA和name-status写入新报告。报告存在即拒绝覆盖。只有该模式通过并保存真实报告后，才能标记“A/B实际提交证明完成”；届时报告及演示分支的推送由开发者决定。暂不提供虚假的提交hash或模拟commit差异。

## 当前限制

真实演示提交及C^/C证明已完成；早先isolated-result.json仍保留当时PENDING状态，不回写历史证据。未重新开展VSCode人工验收、大文件性能或全面第三方插件兼容测试。正式README、最终metrics/ADR整合及p2均不属于本轮。
