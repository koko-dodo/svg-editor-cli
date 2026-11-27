# VSCode 人工验收证据

状态：功能已由开发者在macOS真实Extension Development Host验收通过，等待最终提交；七张原始截图已归档。

最初聊天附件未提供可读PNG；开发者随后提供本地原图目录，已逐张查看并确认与消息上传顺序一致，按下表原样复制。没有裁剪、转换或生成替代图。源目录：`/Users/kodia/Documents/工作:学业/Obsidian Vault/📎`；按源文件时间顺序映射为01–07，逐字节一致。

| 顺序 | 目标文件名 | 内容 |
|---|---|---|
| 1 | 01-file-decoration.png | 未打开SVG时标记、普通文件与.svg目录排除 |
| 2 | 02-outline-navigation.png | 原生Outline层级及中文emoji后tspan定位 |
| 3 | 03-outline-live-update.png | 未保存circle ID修改实时更新 |
| 4 | 04-invalid-xml.png | 缺根闭合标签清空大纲 |
| 5 | 05-xml-recovery.png | 合法XML恢复大纲 |
| 6 | 06-decoration-create.png | 新建SVG出现标记 |
| 7 | 07-decoration-rename.png | SVG改TXT后标记消失 |

反向重命名及删除由开发者确认，不声称有独立截图。详细12项结果及使用注意事项见[扩展说明](../../../vscode-extension/README.md)。未提供具体VSCode/macOS版本号；大文件性能和全面第三方Provider兼容性未测试。

## 原图映射和SHA256

| 源文件 | 归档文件 | SHA256 |
|---|---|---|
| Pasted image 20261127130357.png | [01-file-decoration.png](01-file-decoration.png) | `f7834b0848d43053ffeee680331f94d04cc5f7916acc892cf189a4fa449d1c15` |
| Pasted image 20261127130712.png | [02-outline-navigation.png](02-outline-navigation.png) | `0c086608d5a65b615d323ae91680f316554231dc55457f082ae389e99ccd9a14` |
| Pasted image 20261127130830.png | [03-outline-live-update.png](03-outline-live-update.png) | `98ca504109a2df9701e1cad0ad1c464d110a91cf3c0d93f091347d54d74ea184` |
| Pasted image 20261127130929.png | [04-invalid-xml.png](04-invalid-xml.png) | `28c4702d1e3af4aa86c81f73aed12fb19b570b53c4c9cc06d49e2828381c2809` |
| Pasted image 20261127131004.png | [05-xml-recovery.png](05-xml-recovery.png) | `a49a7be57280e99606a761ac78a7dde27651e53a8f2901cf2d9db0211cc2c87d` |
| Pasted image 20261127131122.png | [06-decoration-create.png](06-decoration-create.png) | `ca9fefbc6ffd638d3bc6dfa51dfb389a463324faf2680036dd8d75d9aff13d38` |
| Pasted image 20261127131209.png | [07-decoration-rename.png](07-decoration-rename.png) | `f462d0296f62d3bb25a910aecdf78b6ead77b859b2483b0a66d25a16d850d350` |
