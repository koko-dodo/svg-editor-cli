# Git 历史指标

Baseline: `177eb20e131849132a777ec0ca576c37a5b00728`
Target: `97b8e97ddd080b3e6bcc29b2033bae60e0d81a0a`

由 collect.mjs 生成；口径见 README.md。目标由参数指定，不自动宣称最终验收。

| 范围 | 文件 final→target | SLOC final→target (Δ) | CC final→target (Δ) |
|---|---:|---:|---:|
| kernel | 40→49 | 1848→2108 (260) | 702→819 (117) |
| host | 1→6 | 6→217 (211) | 4→113 (109) |
| plugins | 0→28 | 0→813 (813) | 0→415 (415) |
| vscode | 0→4 | 0→111 (111) | 0→45 (45) |
| cli | 41→83 | 1854→3138 (1284) | 706→1347 (641) |

## final 文件清单与职责

| 文件 | 分类 | 职责 | 行数 | SLOC | CC |
|---|---|---|---:|---:|---:|
| src/cli/CliOutput.ts | kernel | CLI parsing / execution / rendering | 6 | 5 | 0 |
| src/cli/CommandCatalog.ts | kernel | CLI parsing / execution / rendering | 192 | 184 | 91 |
| src/cli/Dispatcher.ts | kernel | CLI parsing / execution / rendering | 15 | 13 | 4 |
| src/cli/Formatter.ts | kernel | CLI parsing / execution / rendering | 70 | 62 | 31 |
| src/cli/ParsedCommand.ts | kernel | CLI parsing / execution / rendering | 22 | 21 | 0 |
| src/cli/Parser.ts | kernel | CLI parsing / execution / rendering | 11 | 9 | 3 |
| src/cli/Repl.ts | kernel | CLI parsing / execution / rendering | 57 | 53 | 14 |
| src/cli/ShapeSyntax.ts | kernel | CLI parsing / execution / rendering | 78 | 69 | 40 |
| src/cli/Tokenizer.ts | kernel | CLI parsing / execution / rendering | 47 | 44 | 20 |
| src/commands/AddToCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/commands/BackCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/commands/Command.ts | kernel | Domain edit commands / snapshot transactions | 7 | 5 | 0 |
| src/commands/CommandHistory.ts | kernel | Domain edit commands / snapshot transactions | 138 | 116 | 39 |
| src/commands/CommandResult.ts | kernel | Domain edit commands / snapshot transactions | 12 | 9 | 0 |
| src/commands/CreateCommand.ts | kernel | Domain edit commands / snapshot transactions | 21 | 18 | 4 |
| src/commands/DeleteCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/commands/DocumentViewBuilder.ts | kernel | Domain edit commands / snapshot transactions | 54 | 46 | 11 |
| src/commands/FrontCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/commands/GroupCommand.ts | kernel | Domain edit commands / snapshot transactions | 20 | 17 | 3 |
| src/commands/MoveCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/commands/ScaleCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/commands/SetAttributeCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/commands/UngroupCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/io/SvgFileStore.ts | kernel | SVG and filesystem IO | 52 | 48 | 13 |
| src/io/SvgReader.ts | kernel | SVG and filesystem IO | 123 | 118 | 71 |
| src/io/SvgValidation.ts | kernel | SVG and filesystem IO | 26 | 25 | 18 |
| src/io/SvgWriter.ts | kernel | SVG and filesystem IO | 42 | 40 | 12 |
| src/main.ts | host | Host startup / composition / module loading | 7 | 6 | 4 |
| src/model/Circle.ts | kernel | Domain structure / invariants / cloning | 49 | 42 | 12 |
| src/model/Ellipse.ts | kernel | Domain structure / invariants / cloning | 55 | 48 | 14 |
| src/model/Group.ts | kernel | Domain structure / invariants / cloning | 96 | 73 | 33 |
| src/model/Line.ts | kernel | Domain structure / invariants / cloning | 59 | 52 | 14 |
| src/model/Rectangle.ts | kernel | Domain structure / invariants / cloning | 55 | 48 | 14 |
| src/model/Shape.ts | kernel | Domain structure / invariants / cloning | 90 | 76 | 35 |
| src/model/ShapeFactory.ts | kernel | Domain structure / invariants / cloning | 35 | 30 | 8 |
| src/model/ShapeSchema.ts | kernel | Domain structure / invariants / cloning | 24 | 22 | 8 |
| src/model/StyleValidation.ts | kernel | Domain structure / invariants / cloning | 47 | 43 | 28 |
| src/model/SvgDocument.ts | kernel | Domain structure / invariants / cloning | 262 | 217 | 90 |
| src/model/TextShape.ts | kernel | Domain structure / invariants / cloning | 52 | 45 | 14 |
| src/services/Editor.ts | kernel | Application operations / saved baseline / feedback | 173 | 147 | 33 |
| src/services/EditorTypes.ts | kernel | Application operations / saved baseline / feedback | 32 | 23 | 1 |

## target 文件清单与职责

| 文件 | 分类 | 职责 | 行数 | SLOC | CC |
|---|---|---|---:|---:|---:|
| plugins/builtin-commands/BuiltinCommand.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 48 | 40 | 20 |
| plugins/builtin-commands/BuiltinCommands.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 114 | 113 | 111 |
| plugins/builtin-commands/Requests.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 23 | 22 | 0 |
| plugins/builtin-commands/index.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 5 | 4 | 2 |
| plugins/builtin-shapes/BuiltinShapeProvider.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 88 | 85 | 55 |
| plugins/builtin-shapes/Circle.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 56 | 47 | 13 |
| plugins/builtin-shapes/Ellipse.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 62 | 53 | 15 |
| plugins/builtin-shapes/Group.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 16 | 12 | 4 |
| plugins/builtin-shapes/Line.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 66 | 57 | 15 |
| plugins/builtin-shapes/Rectangle.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 62 | 53 | 15 |
| plugins/builtin-shapes/ShapeFactory.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 28 | 21 | 3 |
| plugins/builtin-shapes/ShapeSchema.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 24 | 22 | 8 |
| plugins/builtin-shapes/TextShape.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 59 | 50 | 15 |
| plugins/builtin-shapes/index.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 7 | 7 | 3 |
| plugins/command-dir/DirCommand.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 24 | 22 | 16 |
| plugins/command-dir/DirectoryPort.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 9 | 8 | 0 |
| plugins/command-dir/NodeDirectoryAdapter.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 13 | 11 | 5 |
| plugins/command-dir/index.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 7 | 7 | 2 |
| plugins/command-stats/StatsCommand.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 27 | 24 | 11 |
| plugins/command-stats/index.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 4 | 4 | 2 |
| plugins/shape-box/Box.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 19 | 17 | 7 |
| plugins/shape-box/BoxAttributes.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 15 | 15 | 11 |
| plugins/shape-box/BoxDecorator.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 5 | 5 | 3 |
| plugins/shape-box/BoxProvider.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 54 | 53 | 39 |
| plugins/shape-box/BoxView.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 14 | 14 | 10 |
| plugins/shape-box/index.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 10 | 10 | 2 |
| plugins/tree-star/ModifiedStarDecorator.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 38 | 31 | 26 |
| plugins/tree-star/index.ts | plugins | Plugin-owned models / grammar / behavior / presentation | 7 | 6 | 2 |
| src/api/AttributeHandler.ts | kernel | Public domain and extension contracts | 21 | 18 | 0 |
| src/api/Command.ts | kernel | Public domain and extension contracts | 64 | 54 | 0 |
| src/api/CommandResult.ts | kernel | Public domain and extension contracts | 22 | 13 | 0 |
| src/api/Domain.ts | kernel | Public domain and extension contracts | 24 | 21 | 0 |
| src/api/Editing.ts | kernel | Public domain and extension contracts | 27 | 24 | 0 |
| src/api/Feedback.ts | kernel | Public domain and extension contracts | 19 | 18 | 0 |
| src/api/Numbers.ts | kernel | Public domain and extension contracts | 15 | 14 | 8 |
| src/api/Plugin.ts | kernel | Public domain and extension contracts | 17 | 11 | 0 |
| src/api/Registration.ts | kernel | Public domain and extension contracts | 18 | 16 | 0 |
| src/api/ShapeProvider.ts | kernel | Public domain and extension contracts | 61 | 50 | 0 |
| src/api/TreeDecorator.ts | kernel | Public domain and extension contracts | 14 | 10 | 0 |
| src/api/index.ts | kernel | Public domain and extension contracts | 16 | 14 | 1 |
| src/cli/CliOutput.ts | kernel | CLI parsing / execution / rendering | 6 | 5 | 0 |
| src/cli/CommandCatalog.ts | kernel | CLI parsing / execution / rendering | 53 | 46 | 30 |
| src/cli/Dispatcher.ts | kernel | CLI parsing / execution / rendering | 76 | 70 | 33 |
| src/cli/Formatter.ts | kernel | CLI parsing / execution / rendering | 94 | 80 | 38 |
| src/cli/ParsedCommand.ts | kernel | CLI parsing / execution / rendering | 2 | 1 | 0 |
| src/cli/Parser.ts | kernel | CLI parsing / execution / rendering | 11 | 9 | 3 |
| src/cli/Repl.ts | kernel | CLI parsing / execution / rendering | 58 | 54 | 15 |
| src/cli/Tokenizer.ts | kernel | CLI parsing / execution / rendering | 47 | 44 | 20 |
| src/commands/AddToCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/commands/BackCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/commands/Command.ts | kernel | Domain edit commands / snapshot transactions | 7 | 5 | 0 |
| src/commands/CommandHistory.ts | kernel | Domain edit commands / snapshot transactions | 190 | 161 | 68 |
| src/commands/CommandResult.ts | kernel | Domain edit commands / snapshot transactions | 1 | 1 | 0 |
| src/commands/CreateCommand.ts | kernel | Domain edit commands / snapshot transactions | 21 | 18 | 4 |
| src/commands/DeleteCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/commands/DocumentViewBuilder.ts | kernel | Domain edit commands / snapshot transactions | 8 | 6 | 2 |
| src/commands/EditingContext.ts | kernel | Domain edit commands / snapshot transactions | 40 | 36 | 23 |
| src/commands/FrontCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/commands/GroupCommand.ts | kernel | Domain edit commands / snapshot transactions | 20 | 17 | 3 |
| src/commands/MoveCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/commands/ScaleCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/commands/SetAttributeCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/commands/UngroupCommand.ts | kernel | Domain edit commands / snapshot transactions | 12 | 10 | 3 |
| src/extensions/ExtensionRegistry.ts | kernel | Generic registration / lookup / dispatch | 195 | 181 | 99 |
| src/host/composition.ts | host | Host startup / composition / module loading | 46 | 39 | 11 |
| src/host/loading/PluginConfig.ts | host | Host startup / composition / module loading | 25 | 22 | 16 |
| src/host/loading/PluginData.ts | host | Host startup / composition / module loading | 44 | 38 | 40 |
| src/host/loading/PluginInstaller.ts | host | Host startup / composition / module loading | 57 | 51 | 23 |
| src/host/loading/PluginLoader.ts | host | Host startup / composition / module loading | 56 | 50 | 15 |
| src/io/SvgFileStore.ts | kernel | SVG and filesystem IO | 52 | 48 | 13 |
| src/io/SvgReader.ts | kernel | SVG and filesystem IO | 141 | 137 | 82 |
| src/io/SvgValidation.ts | kernel | SVG and filesystem IO | 26 | 25 | 18 |
| src/io/SvgWriter.ts | kernel | SVG and filesystem IO | 35 | 33 | 12 |
| src/main.ts | host | Host startup / composition / module loading | 18 | 17 | 8 |
| src/model/ContainerShape.ts | kernel | Domain structure / invariants / cloning | 100 | 72 | 31 |
| src/model/DocumentView.ts | kernel | Domain structure / invariants / cloning | 47 | 44 | 15 |
| src/model/Shape.ts | kernel | Domain structure / invariants / cloning | 118 | 82 | 38 |
| src/model/ShapeTree.ts | kernel | Domain structure / invariants / cloning | 98 | 79 | 53 |
| src/model/StyleValidation.ts | kernel | Domain structure / invariants / cloning | 47 | 43 | 28 |
| src/model/SvgDocument.ts | kernel | Domain structure / invariants / cloning | 275 | 226 | 90 |
| src/services/Editor.ts | kernel | Application operations / saved baseline / feedback | 221 | 190 | 51 |
| src/services/EditorTypes.ts | kernel | Application operations / saved baseline / feedback | 32 | 21 | 0 |
| src/services/FeedbackResolver.ts | kernel | Application operations / saved baseline / feedback | 35 | 31 | 17 |
| vscode-extension/src/SvgDocumentSymbolProvider.ts | vscode | VSCode providers / independent XML outline | 23 | 21 | 10 |
| vscode-extension/src/SvgFileDecorationProvider.ts | vscode | VSCode providers / independent XML outline | 36 | 30 | 16 |
| vscode-extension/src/XmlOutlineParser.ts | vscode | VSCode providers / independent XML outline | 54 | 48 | 17 |
| vscode-extension/src/extension.ts | vscode | VSCode providers / independent XML outline | 13 | 12 | 2 |
