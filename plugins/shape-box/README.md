# box 复合图形插件

通过独立 manifest 注册 BoxProvider、BoxAttributes 和 BoxDecorator；仅依赖公开 API 与本包。内置 rect/text 由 ShapeServices 按 kind 创建，不导入具体模型、宿主或其他插件实现。使用根配置中的 `./plugins/shape-box`，以 `npm run cli -- --config plugins.config.json` 启动。

```text
create box n1 120 100 160 60 "开始" [in <containerId>]
set n1 fill #f5a623
set n1 label "处理数据"
```

## 领域与局部业务选择

- 必要部件为直接子节点 `n1-rect`（kind=rect）及 `n1-label`（kind=text），全树 ID 唯一。创建与读回使用相同不变量；识别为 box 但缺部件/类型或父级错误时拒绝整个操作。重复 ID 也拒绝，不静默降级。
- 矩形用输入 x/y/w/h，默认填充 `#4a90d9`；文字初始位置取 `(x+20,y+35)`，与原文两个示例一致。文字不添加未规定的默认样式。原文没有定义任意尺寸下的排版算法，故不做文字测量或自适应居中。
- 几何只存在于子图形；move/scale 复用 ContainerShape 的后代算法。clone 保留 box 类型、样式、子树和顺序，无可变节点共享。
- 允许额外子节点和嵌套 box；允许必要部件直接属性修改及重排。仅拒绝破坏必要部件存在/ID/语义类型/直接父级的行为，如删除、移走或单独分组必要部件。整体删除、移动、缩放、group 收编仍可用；ungroup 固定拒绝。直接修改矩形后不自动重算文字位置，没有第二份几何状态。
- 普通 group 样式仍可存储和读回；CLI 的 box.fill 专门修改矩形，label 专门修改文字。未命中自定义属性沿用原白名单。

## 事务、反馈与标签

属性处理器借用窄 AttributeMutation，经现有单一事务提交；处理器/候选校验/反馈失败由已有历史回滚，不在插件中另建历史。undo/redo从快照恢复，不重执行操作。描述器用恢复后的视图生成原文要求的 create/move/fill/label 反馈，label undo 显示旧文本。树通过独立装饰器在 `g#id` 后追加 `(box)`，其他节点不标注。

序列化为 `g data-kind="box"`，递归读写由内核负责，插件保留已有子节点/顺序和公共样式。未安装插件时读为普通 g，丢失 box 语义但保留 SVG 内容；安装后非法 box 按上述规则拒绝整个 read。

## 验证

`tests/plugins/Box.test.ts` 包含独立公共服务替身、真实命令/历史、嵌套变换、ID冲突、保护/读回/降级、属性冲突/部分失败/反馈失败，以及真实 Node+tsx 执行完整 `doc/transcript/box-version-b.txt`。

`tests/plugins/fixtures/box-version-b.stdout.txt` 固定核验全会话反馈与树输出，不自动重采样。反馈、几何及保存元素数对照原文；树保留已验收 Phase 1 的统一两空格分隔及 line 的显式 `stroke=black`，与作业展示中的对齐空白/省略样式存在既有差异（此前基线已记录）。没有修改原 Phase 1 Golden 来适应插件。
