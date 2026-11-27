# 图形统计命令

`stats` 不接受参数，需要已初始化或读入的文档。只通过公开查询视图从画布子节点按当前顺序 DFS；按 kind 统计叶子，类型按首次出现顺序输出。任何 container 节点只计容器，其内部叶子照常统计；SVG 根不计容器。

```text
rect: 3  circle: 1  text: 2  (total 6, containers 2)
```

空文档输出 `(total 0, containers 0)`。查询计划没有修改、保存或历史能力，不创建 undo 单元或 IO 屏障。插件只依赖公开 API，与内置命令及其他插件独立；manifest 声明 stats。

在仓库根配置中加入 `{"module":"./plugins/command-stats"}`，以 `npm run cli -- --config plugins.config.json` 启动；可用 enabled:false 单独禁用。无配置启动仍保持原默认能力。测试见 `tests/plugins/Stats.test.ts` 及 `tests/plugins/CommandPlugins.test.ts`。
