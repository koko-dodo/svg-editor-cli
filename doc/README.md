# CLI SVG Editor

## 1. 架构方案

### 1.1 项目概述

本项目旨在基于 TypeScript 实现一个命令行 SVG 编辑器（CLI SVG Editor），通过命令行交互完成 SVG 文档的创建、读取、保存以及图形元素的编辑与管理。

编辑器支持矩形、圆形、椭圆、直线、文本和分组容器六种基本图形类型，并提供图形创建、删除、移动、缩放、属性修改、分组与解组、层级调整、结构查看以及撤销重做等功能。

在软件设计方面，项目采用面向对象的设计方法，通过模块化架构分离用户交互、命令处理、图形模型和文件读写等职责。其中，使用 Composite（组合）模式统一管理基本图形和组合图形，使用 Command（命令）模式封装编辑操作并支持 Undo/Redo。

本项目的设计目标是在满足功能需求的基础上，保持模块职责清晰、依赖关系合理，并为后续增加图形类型、扩展交互方式和演化系统架构提供基础。

### 1.2 模块划分

实际目录结构如下：

```
src/
├── cli/
├── commands/
├── model/
├── services/
├── io/
└── main.ts
```

各模块的职责如下：

| 模块 | 主要职责 |
|---|---|
| `cli` | 负责命令行交互，包括读取用户输入、解析命令参数、输出执行结果及错误信息。 |
| `commands` | 负责封装图形编辑操作，提供命令执行、撤销与重做机制，并管理编辑历史。 |
| `model` | 负责 SVG 图形的领域模型，包括图形属性、几何变换、父子关系及文档结构管理。 |
| `services` | Editor 提供应用入口，协调命令与文档生命周期；当前文档版本由 CommandHistory 唯一持有。 |
| `io` | 负责 SVG 文件的解析、序列化及文件系统读写，实现领域对象与 SVG 文件之间的转换。 |
| `main.ts` | 连接 stdin/stdout/stderr、判断交互模式并启动 Repl，处理顶层流错误。 |

实际跨模块依赖如下，箭头表示源码依赖，不表示调用顺序；Node.js 和第三方库不列入业务模块图。

```plantuml
@startuml
skinparam componentStyle rectangle
component "main.ts" as Main
package "cli" as CLI {}
package "services" as Services {}
package "commands" as Commands {}
package "model" as Model {}
package "io" as IO {}
Main ..> CLI
CLI ..> Services
Services ..> Commands
Services ..> Model
Services ..> IO
Commands ..> Model
IO ..> Model
@enduml
```

`main.ts` 是启动与装配入口，但没有直接构造全部对象：Repl 默认创建 Editor，Editor 默认创建 CommandHistory、ShapeFactory 和 SvgFileStore；测试可注入 Editor 或文件访问依赖。入口不包含编辑业务逻辑。

### 1.3 设计模式

本项目主要采用 **Command（命令模式）** 和 **Composite（组合模式）**，分别解决编辑操作管理和图形层次结构管理的问题。此外，借鉴 Memento（备忘录模式）的思想，通过文档状态快照实现撤销与重做。

#### 1.3.1 Command 模式

将编辑操作封装为独立的命令对象，操作请求与具体执行的逻辑分离。

采用以下设计：

| 组件 | 职责 |
|---|---|
| `Command` | 定义统一的命令执行接口 |
| 具体 Command | 封装编辑参数，通过 ID 定位图形并调用领域模型完成操作 |
| `Editor` | 提供应用层接口，创建并提交具体命令 |
| `CommandHistory` | 管理命令执行、状态快照及 Undo/Redo 历史 |

以 `move r1 50 20` 为例：
```
CLI → Editor → CommandHistory.execute(MoveCommand)
                    → MoveCommand.execute(工作副本) → SvgDocument → Shape.move()
```

**撤销重做策略：** 采用 Command 与文档快照相结合的方案。`CommandHistory` 统一保存编辑前后的状态，通过快照恢复实现 Undo/Redo，而不要求各命令分别实现逆操作。编辑命令在工作副本上执行，成功后才提交，以保证操作的原子性。执行成功后还会防御性克隆，隔离命令可能保留的引用；Undo/Redo 直接恢复版本，不重执行命令。失败不改变当前文档、历史栈或屏障，成功的无变化编辑也计一个历史单元。

实现位于 `src/commands/CommandHistory.ts`：它统一持有当前版本、Undo/Redo 栈和屏障状态。Editor 不另存可变文档。成功的 init/read/save/canvas 尺寸修改清空历史并设置屏障，直到下一次成功编辑；显示操作不设置屏障。

#### 1.3.2 Composite 模式

SVG 文档具有树形结构，普通图形和分组容器可以递归组合。
本项目采用 Composite 模式，统一管理基本图形与组合图形。

具体设计如下：

| 组件 | 职责 |
|---|---|
| `Shape`（Component） | 定义 `move()`、`scale()`、`setAttribute()` 等公共操作接口 |
| `Rectangle`、`Circle` 等（Leaf） | 实现各类图形的几何行为和属性管理 |
| `Group`（Composite） | 维护 `Shape` 子节点集合，并递归执行组合操作 |
| `SvgDocument` | 管理图形树、全局 ID 唯一性及结构合法性 |

类层次关系如下：

```text
                  Shape
                    ▲
        ┌───────────┴───────────┐
        │                       │
   基本图形（Leaf）         Group（Composite）
   ├── Rectangle                 │
   ├── Circle                    └── children: Shape[]
   ├── Ellipse
   ├── Line
   └── TextShape
```

实现位于 `src/model/Shape.ts`、五个基本图形类和 `Group.ts`。例如执行 `move g1 50 20`，Group 递归收集叶子图形，在副本上验证全部变换后，调用原对象的多态方法；当前内置图形失败时保持状态，成功时保持对象引用。Group 样式只设置自身，不覆盖子节点显式样式。

`src/model/SvgDocument.ts` 通过对象隔离维护结构约束：添加外部子树时复制，查询时返回独立副本；编辑只能按 ID 作用于内部对象。文档负责全局 ID 唯一、单父和无环约束；Group 仅管理直接子节点、顺序及循环检查。查找采用递归遍历，不维护长期 ID 索引或父节点表，多步结构修改使用内部工作副本保证原子性。

#### 1.3.3 设计模式的协作

Command处理编辑行为，负责封装操作并参与历史管理；
Composite 模式处理图形结构，将该操作正确地作用于图形树；
两者协同工作。

例如：

```text
用户执行 move g1 50 20
          ↓
      MoveCommand
          ↓
      SvgDocument
          ↓
       Group g1
          ↓
   递归移动所有子图形
```

---

### 1.4 模块依赖规则

本项目采用单向依赖的模块组织方式，尽量避免循环依赖，并使领域模型保持相对独立。

实际依赖图见 §1.2，允许的依赖边界如下。

#### 1.4.1 允许的依赖关系

| 模块 | 允许依赖的模块 | 原因 |
|---|---|---|
| `model` | 不依赖其他业务模块 | 保持图形模型独立，避免受交互和文件处理方式影响 |
| `commands` | `model` | 命令需要通过 SvgDocument 查询并操作图形 |
| `io` | `model` | 文件读写需要访问图形对象并进行格式转换 |
| `services` | `commands`、`model`、`io` | Editor 负责协调命令执行、文档状态及文件操作 |
| `cli` | `services` | CLI 通过应用层接口完成操作，不直接修改图形 |
| `main.ts` | 各模块的公开入口 | 负责初始化对象及完成依赖装配 |

#### 1.4.2 禁止的依赖关系

**规则一：Model 不依赖其他业务模块。**

图形对象只负责自身属性、几何行为和结构关系，不应该直接读取终端输入、访问文件系统或管理命令历史。

这样未来即使由 CLI 扩展为 GUI，也可以复用原有图形模型。

**规则二：Commands 不依赖 CLI、Services 或 IO。**

具体 Command 通过 `SvgDocument` 操作领域对象，不调用 Editor，也不直接进行文件读写。

这可以避免命令执行逻辑与交互方式耦合，以及 `services` 和 `commands` 之间形成循环依赖。

**规则三：IO 不依赖 CLI、Commands 或 Services。**

`SvgReader` 和 `SvgWriter` 只负责 SVG 文件与领域对象之间的转换。文件读取产生的警告或错误应作为结果返回，由上层决定如何展示，不应直接输出到终端。

**规则四：Services 不依赖 CLI。**

Editor 提供与交互方式无关的应用接口，例如 `move(id, dx, dy)`。

CLI 可以调用这些接口，而未来的 GUI 也可以调用相同接口，不需要重新实现编辑业务逻辑。

**规则五：CLI 不直接修改领域模型。**

CLI 负责命令解析、参数转换和结果展示，不能绕过 Editor 和 CommandHistory 直接修改 Shape，否则可能破坏撤销重做机制。

#### 1.4.3 模块依赖的设计依据

上述依赖规则主要依据单一职责原则、关注点分离和依赖倒置思想。

设计时重点考虑：某个模块发生变化时，哪些模块应该受到影响，哪些模块应当保持稳定。

例如：

- 修改 CLI 输入格式，不应影响图形几何行为。
- 修改 Undo/Redo 实现，不应影响 SVG 文件解析。
- 更换 XML 解析库，不应影响 Command 的执行逻辑。
- 新增 GUI，不应要求重写已有的图形操作。

入口的实际装配方式见 §1.2，不承担具体业务逻辑。

已通过源码核查与全模块字面量依赖测试验证这些规则，证据及边界见 §3、§4。

---

### 1.5 未来变化点假设

#### 1.5.1 从 CLI 扩展为 GUI

**变化假设：**

后续版本可能增加图形化交互界面，使用户能够通过鼠标选择、拖动、缩放图形，并通过属性面板修改图形。

**可能受到影响的模块：**

- 新增 GUI 交互模块。
- `services` 可能增加界面状态查询或变更通知接口。
- `main.ts` 可能需要调整应用启动和对象装配方式。

**当前设计的应对方式：**

将用户交互逻辑与领域模型、编辑命令分离。

CLI 和未来的 GUI 都通过 Editor 提供的应用接口执行操作，共用 Command、CommandHistory 和 SvgDocument。

此外，图形对象通过 ID 定位，GUI 不需要长期保存 Shape 的对象引用，从而避免快照恢复后对象实例变化导致的引用失效。

对于 GUI 中连续的鼠标拖拽操作，未来可能需要将多个事件合并为一个编辑事务，以保证一次拖拽只产生一个 Undo 单元。

**当前不实现 GUI 相关框架**，只保证核心业务逻辑不依赖终端交互。

#### 1.5.2 新增图形类型

**变化假设：**

后续可能新增 Triangle、Polygon 等基本图形，或者增加由多个基本图形组成的复合图形。

**可能受到影响的模块：**

- `model`：增加新的 Shape 子类。
- 图形工厂：增加类型名称与图形类的映射。
- `io`：适配新类型的读取与序列化。

**当前设计的应对方式：**

通过 Shape 抽象类统一图形操作，并使用多态实现各图形的几何行为。

对于 `move`、`scale` 等通用操作，新增图形类型后不应要求修改已有编辑命令。

对于不同类型的创建，采用集中的图形工厂进行分派，避免在各模块中重复出现类型判断。

实验允许在命令分发和图形工厂中采用按名称分派的方式，当前将 CommandCatalog 和 ShapeFactory 明确标记为后续扩展时的待重构点，本阶段保留集中分发。

#### 1.5.3 引入图形插件机制

**变化假设：**

后续可能允许通过插件注册新的图形类型，例如实验文档中提到的 `box` 复合图形。

插件可能需要定义图形创建参数、属性行为、内部子图形结构以及序列化规则。

**可能受到影响的模块：**

- 图形创建机制。
- 类型注册机制。
- 属性处理与 SVG 读写机制。

**当前设计的应对方式：**

本阶段不实现完整插件框架，但在设计时尽量集中图形创建逻辑，并通过 Shape 的统一接口减少编辑命令对具体类型的依赖。

未来可以考虑引入 `ShapeProvider` 或类似的类型注册机制，使新增图形类型不再需要修改核心分派逻辑。

**暂不实现的理由：**

Phase 1 只要求支持六种内置图形类型，完整插件系统会增加当前项目的复杂度，属于现阶段没有必要的过度设计。

#### 1.5.4 撤销重做的性能优化

**变化假设：**

后续可能支持更复杂的 SVG 文档，包含大量图形或较长的编辑历史。

此时，每次操作都复制完整文档可能产生较高的时间和内存开销。

**可能受到影响的模块：**

- `CommandHistory`。
- 文档快照及恢复机制。

**当前设计的应对方式：**

本阶段采用完整文档快照，优先保证复杂编辑操作的正确性和实现的可理解性。

同时将快照管理集中在 CommandHistory 内部，避免 CLI、Editor 和具体 Command 直接依赖快照的内部数据结构。

如果后续遇到性能问题，可以考虑增量快照、结构共享或针对特定操作使用逆操作。

**暂不优化的理由：**

本阶段没有明确的大规模文档性能要求，提前实现复杂的增量历史机制可能增加开发与测试成本。

---

## 2. 与 AI 协作的过程记录

### 2.1 第一次架构评审：模块职责与依赖关系

**初始方案：**

采用五模块架构，由 Editor 协调命令执行、文档管理和文件读写，CommandHistory 管理撤销重做历史，SvgDocument 维护图形对象树。

**AI 提出的建议：**

Codex 认为整体模块划分适合 Phase 1，无须重新设计目录，但指出 Editor、Command 和 SvgDocument 的职责边界需要进一步明确。

特别是，如果 Editor 同时承担命令解析、几何操作、文件读写和历史管理，可能逐渐演变为上帝类。

Codex 建议将具体编辑行为交给 Command 和领域模型，Editor 仅负责应用层协调。

**人工判断与决策：**

接受这一建议，保留原有模块划分，但进一步明确职责：

- CLI 负责交互和命令解析。
- Editor 提供类型化应用接口并创建 Command。
- Command 负责执行具体编辑操作。
- SvgDocument 管理文档结构及 ID 约束。
- Shape 负责自身几何行为。
- CommandHistory 管理编辑历史。
- IO 负责文件读写。

同时决定暂不引入独立的 CommandFactory 或通用 CommandBus，避免在当前项目规模下产生不必要的抽象。

**阶段结果：**

形成更明确的模块职责和单向依赖规则，为后续编码提供约束。

### 2.2 文档对象隔离与结构约束（Task 2～3）

AI 评审指出：外部可直接修改 Group 子节点时，文档的单父与全局 ID 约束可能被绕过。讨论过 Group 静态 WeakMap 归属记录以及文档隔离对象等方案。人工决定不引入隐藏的全局归属状态，选择添加和查询均复制子树，所有文档编辑按 ID 进行。

最终由 SvgDocument 统一维护结构约束，Group 保留局部操作接口。`tests/model/SvgDocument.test.ts` 验证了输入/查询隔离、共享节点和循环拒绝、跨容器迁移及失败原子性；没有将 Group 单独使用时的跨容器共享误写成已禁止。

### 2.3 当前文档归属调整（Task 4～5）

AI 提出的历史管理推荐方案将当前文档与快照栈集中到 CommandHistory，避免 Editor 和历史管理器分别持有可变当前文档。人工确认采用该方案，并允许命令成功后再防御性克隆一次，接受复制成本以换取引用隔离。

Editor 最终成为创建具体命令、协调生命周期和查询的薄入口。`tests/commands/CommandHistory.test.ts` 验证完整属性/结构/顺序恢复、失败后 Redo 保留、屏障以及 Undo/Redo 不重新执行命令；Editor 测试验证应用层不会绕开历史管理。

### 2.4 审计发现样式校验不一致（Task 8.1～8.3）

AI 审计复现了模型允许设置的样式在 Writer 中被拒绝的问题，并指出仅凭读写往返相等不足以证明满足实验。人工要求只修复相关一致性问题，不扩大为通用 SVG 支持，也不改变既定分组和继承语义。

Task 8.2 新增 `model/StyleValidation.ts`，由 Shape、Reader、Writer 共用；ShapeFactory 通过图形构造复用校验，model 无需依赖 io。非法样式在编辑阶段即被拒绝。Writer 移除导入配额，Reader 保留安全上限，因此超限导出仍不能直接读回。该阶段 527 项测试通过。

Task 8.3 补充手写 SVG 导入、独立 XML 导出断言、实验典型会话和真实临时文件部分写入后抛错等测试，最终 26 个文件、535 项测试通过；这提供了独立证据，不代表所有 SVG 或浏览器视觉效果都已验证。

## 3. 架构一致性自查

### 3.1 实际模块与依赖

五模块目录与 §1.2 一致。新增 ShapeFactory/ShapeSchema/StyleValidation 仍归 model，SvgFileStore 归 io，没有增加反向业务依赖。

| 模块 | 实际跨层依赖 | 核查结果 |
|---|---|---|
| main.ts | cli | 与 UML 一致；启动 Repl |
| cli | services | 通过 Editor 编辑；通过 EditorTypes 获取结果类型和公开元数据 |
| services | commands、model、io | 创建具体命令、生命周期协调和文件访问 |
| commands | model | 按 ID 操作文档，保存快照，不访问 CLI/IO |
| io | model | 读写模型和共享校验，不访问 commands/services |
| model | 无其他业务模块 | 封装几何、样式和结构规则 |

源码核查未发现跨业务模块循环依赖；`tests/contracts/Architecture.test.ts` 递归检查全部 src 的字面量导入与重导出，不是通用 TypeScript 依赖分析器。

### 3.2 模式与名称分发

- **Command**：十种编辑操作由十个具体 Command 类实现 `execute(document): CommandResult`，由 Editor 创建、CommandHistory 在副本上执行，参数通过 ID 定位。front/back 在实验表中合为一行，在代码中分别实现。
- **Composite**：Group 与五种叶子均继承 Shape，命令不按叶子类型分派 move/scale/set；具体变换在模型内实现，集合与字段均封装。当前预检策略针对内置图形，不承诺任意插件的副作用原子性。
- **R5 的项目解释**：CommandCatalog 集中命令名的解析、执行与反馈；ShapeFactory 是类型名到具体构造类的唯一入口。ShapeSchema 描述标签、类名和属性，ShapeSyntax 保留 CLI 参数及展示布局；这些表属于描述性元数据，不是另一套图形创建或几何算法分发。

Reader 仍有 text/g 内容特例，Writer 和 DocumentViewBuilder 仍使用类名识别元数据。名称分派的严格验收口径与未来类名变更风险尚在，不能声称已实现无需修改核心的插件机制。

### 3.3 实验原文与项目约定

| 项目 | 当前决策及边界 |
|---|---|
| R1：参数语法 | `init 400` 高度取 600；canvas 查询无参数，修改必须同时给宽高；group 接受至少一个成员。实验的 `canvas [w] [h]`、`group <newGid> <id1> <id2>…` 未完全消除歧义，按此前人工确认实现，仍需确认验收口径。 |
| 分组位置与顺序 | 新 Group 放在最近公共父容器的最早受影响分支处，成员按原文档 DFS 顺序排列；拒绝祖先和后代同时入组。LCA/插入位置是项目补充约定。 |
| R4：继承样式 | group/ungroup/addto 保留显式样式，不固化原父容器的继承值；换父容器可能改变外观。实验明确结构和顺序，未明确要求外观保持。 |
| R2：导入范围 | 已允许根节点 version=1.0/1.1/2.0；视觉属性不能静默忽略。仍为有限 SVG 子集，详见 §4.2。 |
| R3：样式与保存 | 共用 StyleValidation；非法值失败不进入历史。导出不再施加导入配额，但不保证任意大小文档的性能或可再次导入。 |
| R6：错误分类 | addto 目标不存在为 `no such shape`；create 的 in 目标不存在仍为 `no such container`，非容器仍为 `not a container`。 |

CLI 另采用以下已确认约定：仅双引号分组，支持转义双引号与反斜杠，其他反斜杠保留；忽略空行及允许缩进的行首 # 注释，不支持行尾注释。命令名大小写敏感；help 可在无文档时使用；EOF 结束，交互模式显示 `svg>`，脚本模式不显示提示符。成功输出到 stdout，warning/error 到 stderr，异步命令逐行 await。

read/save 失败不改变文档、历史或默认路径；默认保存路径仅取最近成功 read 的路径，显式 save 不更新它，init 成功清除它。IO 期间禁止编辑和第二个 IO 请求，查询可读取已提交状态。

## 4. 质量保证手段

### 4.1 验证证据

| 层次 | 实际证据 |
|---|---|
| 模型单元测试 | `tests/model/`：六种图形、属性白名单、数值与溢出校验、递归变换、克隆隔离、结构/顺序和失败原子性。 |
| 命令与应用集成 | `tests/commands/`、`tests/services/`：快照恢复、Redo 保留、屏障、默认路径、IO 忙碌保护。 |
| CLI 集成 | `tests/cli/`：参数与转义、输出流、错误后继续、真实入口脚本及文件 read/save。 |
| 独立实验契约 | `tests/io/SvgContract.test.ts`：手写导入数据的明确期望、直接解析导出 XML；`tests/contracts/Session.test.ts`：实验 §6 完整会话及 RGB/HSL 保存读取。 |
| 故障与项目约定 | `tests/io/SvgFileStore.test.ts`：临时文件已写入部分字节后抛错，旧目标完整；`tests/contracts/GroupStyle.test.ts`：显式样式与父容器变化；Architecture 测试检查全部业务层依赖。 |

Task 8.3 的实际验证结果：`npm run build` 通过；`npm test` 的 **26 个测试文件、535 项测试全部通过**；`git diff --check` 通过。Task 8.4 仅修改本文档，并再次检查 diff；测试数量记录的是上述已执行结果。

手工验收证据目前限于 Task 8.1 的内存命令探测（参数错误、结构变化、样式与导入边界）；完整会话与真实入口由自动化测试回放。尚无可据此宣称通过的完整人工交互终端或浏览器验收记录。提交前可用 `npm run cli` 回放实验 §6/§6.1，检查保存结果、错误后继续和 Ctrl-C，另用浏览器检查 SVG 预览；这些是待人工确认项。

### 4.2 SVG 支持范围与限制

- Reader 支持 XML 1.0、UTF-8 和 SVG 命名空间中的 rect/circle/ellipse/line/text/g；保留嵌套、绘制顺序、文本和显式样式，不自动写入默认样式。必需几何属性不得省略，数值为有限十进制数，不接受 px/% 长度；画布宽高为正。
- viewBox 可省略；存在时仅支持 `0 0 width height`。缺失或空白图形 ID 先预留全文件显式 ID，再按标签+序号补齐并警告；重复显式 ID 拒绝。
- 根节点 version=1.0/1.1/2.0 作为元数据接受，不表示支持相应版本的全部特性；有限白名单还允许忽略 data-kind。根级 id、fill/stroke 等目前仍不支持；不会把无法表示的继承样式静默丢弃。
- 公共样式为 fill/stroke/stroke-width。颜色支持名称、3/4/6/8 位十六进制、RGB/HSL（含透明度与 hue 单位），以及 none/transparent/currentColor/inherit/initial/unset；不支持完整 CSS 表达式。空值、URL、CSS 变量和非法值被拒绝。
- 拒绝 DOCTYPE、未知元素、事件属性、危险资源引用及无法表达的 transform/opacity/font-size/text-anchor 等视觉属性。使用 saxes 严格校验 XML，再由 xmldom 构建 DOM；Writer 生成标准 XML，SvgFileStore 同目录临时写入后 rename 替换目标。
- Reader 导入上限为 **1 MiB、128 层图形嵌套、10,000 个图形元素**（不计 svg 根节点）。Writer 不施加这些配额，仍校验样式及 XML 字符；超限导出可能无法再读入，递归实现和完整快照仍受内存与调用栈限制。

### 4.3 未验证与交付边界

未验证浏览器像素渲染、真实磁盘耗尽、跨平台文件系统权限/崩溃持久性、真实终端 Ctrl-C。部分写入故障使用真实临时文件加注入异常，不等同于耗尽磁盘；样式测试验证显式属性与继承来源，不计算渲染像素。依赖测试覆盖当前字面量相对路径，不保证识别运行时计算路径、未来路径别名或任意动态加载。

本项目不包含 GUI、box 插件或完整 SVG/CSS 支持。提交历史、远程推送、截止时间以及最终提交的 `final` 标签需人工核查和执行，不能由测试通过推断已完成交付。
