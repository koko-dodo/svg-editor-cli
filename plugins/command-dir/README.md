# 当前目录命令与文件系统适配器

`dir` 不接收参数，不需要 SVG 文档，列出命令执行时的进程当前目录。read/save 不改变该目录，也不把它切换到 SVG 文件所在目录。查询计划不编辑文档、不改变保存基准、undo/redo 或 IO 屏障。

目录优先，其次文件；各组以 JS 字符串序比较原始名称，区分大小写、与 locale 无关。包含隐藏项；不递归，不列出 `.` / `..`。标签后恰好两个空格。空目录输出 `(empty directory)`；读取失败抛出 `cannot read directory: <path>`，由 CLI 统一输出 `error:` 并继续后续命令。

NodeDirectoryAdapter 使用 readdir 的 Dirent，不遍历链接目标：普通目录显示 `[DIR]`，普通文件、指向目录/文件的链接、断链及其他特殊项均显示 `[FILE]`。名称空格原样保留；名称中的 CR/LF 仅在显示时转义为字面 `\r`/`\n`，保证每个子项一行，不修改文件名。排序不修改适配器返回的集合。

## Adapter 关系

- Client：DirCommand，负责参数、排序、显示和错误约定。
- Target：DirectoryPort，以及只含名称/目录分类的 DirectoryEntry。
- Adapter：NodeDirectoryAdapter，把 Node Dirent 转成目标接口；cwd 函数可注入测试目录，默认在每次命令执行时取真实 process.cwd。
- Adaptee：Node.js readdir/Dirent 与 cwd。

命令测试注入 mock DirectoryPort；真实临时目录测试组合相同 DirCommand 和 NodeDirectoryAdapter，包括符号链接、隐藏项及失败路径。实现没有工作区索引或递归遍历，与 stats 独立，只依赖公开 API、本包和 Node 内建模块。

在根配置中加入 `{"module":"./plugins/command-dir"}`，以 `npm run cli -- --config plugins.config.json` 启动。可单独启停，也可与 stats 同时启用。测试见 `tests/plugins/Dir.test.ts` 及 `tests/plugins/CommandPlugins.test.ts`。
