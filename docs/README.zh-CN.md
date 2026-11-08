# VocaLume

![VocaLume](brand/VocaLume-logo-hd.png)

**免费看直播双语字幕，也能打中文、翻成日文再回复。**

为想看懂外语直播、跟不同语言的朋友聊天的人制作。语音、阅读和打字可分别选择翻译语言，不只限于日文。

[网站与视频示范](https://vocalume.vercel.app/) · [4.6.6 测试版下载](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.6) · [English](../README.md)

## 先下载适合电脑的版本

选择适合电脑的应用。要在浏览器看实时字幕，再下载一种扩展程序 ZIP。通用 ZIP 也包含 Windows 连接工具。**Source code** 是开发用源代码。

| 你的电脑 | 下载 |
| --- | --- |
| Windows x64 | [点这里下载](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.6/VocaLume.Setup.4.6.6.exe) |
| Mac · Apple Silicon (M1–M5) | [点这里下载](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.6/VocaLume-4.6.6-arm64.dmg) |
| Mac · Intel | [点这里下载](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.6/VocaLume-4.6.6.dmg) |
| Linux x64 · 实验性 | [点这里下载](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.6/VocaLume-4.6.6.AppImage) |
| Windows 扩展程序（Chrome / Edge） | [点这里下载](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.6/vocalume-extension-windows.zip) |
| 通用扩展程序（Chrome / Edge / Opera GX） | [点这里下载](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.6/vocalume-extension.zip) |

上方是 **4.6.6 测试版** 应用和扩展程序，请按电脑平台下载。

不知道 Mac 是哪种？点 ** → 关于这台 Mac**，查看「芯片」或「处理器」。

## 三步开始使用

1. **安装 App、下载模型：** 选择声音来源、听到的语言，以及要翻译成的语言。
2. **要在网站用，也装扩充功能：** ZIP 解压到固定文件夹，在 Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`，Opera GX 打开 `opera://extensions`。接着打开「开发者模式」，选「加载未封装扩充功能」。**这个文件夹不能删除。**
   要在浏览器使用本地字幕，请按 [Mac](user-guide.md#連接-mac-app-與-extension) 或 [Windows](user-guide.md#連接-windows-app-與-extension) 的步骤连接一次。Linux 可用独立应用或扩展程序的浏览器模式。
3. **开始看字幕或回复：** 播放视频并开始语音字幕；网站文本翻译可自行打开。回复时先翻译、确认内容，再自行送出。

[完整安装、更新与疑难排解](user-guide.md)

## 可以拿来做什么？

- **听懂直播：** 显示双语字幕，可选单组或四组。
- **读懂文本：** 翻译支持网站的贴文、标题和聊天室。
- **方便回复：** 先用熟悉的语言打字，再翻成对方的语言，不必一直切出去拷贝粘贴。
- **直播字幕与聊天：** 将译文或双语字幕输出到 OBS，并把支持的直播聊天室留言翻成自己看得懂的语言。
- **调成喜欢的样子：** 选择语言方向、字幕大小、颜色、外框与背景。
- **自行选择引擎：** 使用本机模型，或选填自己的 Gemini、OpenAI、Claude 等 API。

## 使用前知道这几件事就好

- **本机模式免费，不需要付费 API。** 首次需下载模型，速度依电脑性能与负载而异；选用外部 API 则依服务商收费。
- **目前是公开测试版。** 辨识与翻译可能失败或翻错，重要内容请对照原文。
- **提供 Mac、Windows App；Linux 为实验性。** Windows 本地浏览器字幕的测试范围可参考[实机验收报告](reports/windows-acceptance-2026-11-06.md)。浏览器模式的语音字幕需要 WebGPU 和网络翻译。
- **安装档尚未签章／公证。** 遇到系统提示请参考使用手册。
- **界面语言。** 应用与扩展程序提供简体中文、繁体中文、英文、日文和韩文。Windows 或 Mac 连接后可同步界面语言。扩展程序在官网启用时，官网也可同步。翻译语言可另外设置。

## 一起让它更好用

遇到问题或想要的新功能，欢迎[留下回馈](https://github.com/clark970417-eng/VocaLume/issues/new)。附上系统、操作情况与不含个资的截屏即可，**不要提供密码或 API 密钥**。

## 收藏项目，追踪最新版本 ⭐

1. 打开 [VocaLume GitHub 首页](https://github.com/clark970417-eng/VocaLume)，登录 GitHub；没有帐号可先[免费注册](https://github.com/signup)。**下载不需要帐号。**
2. 在项目页右上方按 **Star ☆**；变成 **Starred ★** 就代表收藏成功。手机版的位置可能不同。
3. **想收到新版通知：** 在同一页按 **Watch → Custom → 勾选 Releases → Apply**。若已显示 Watching，可打开该菜单调整通知。
4. 之后也能直接打开 [版本列表](https://github.com/clark970417-eng/VocaLume/releases)，确认版本、阅读更新内容并下载。

**Star 是收藏，不会自动订阅新版通知，也不会自动更新 App。** 新版通知由 GitHub 处理，实际接收方式依你的帐号通知设置。收到通知后，停止收音并依本页的更新步骤安装。

<details>
<summary>更多设置、测试记录与授权</summary>

[扩充功能与 API 设置](extension-guide.md) · [测试结果与待验证项目](quality/README.md) · [4.6.6 更新](releases/4.6.6.md) · [开发说明](development.md) · [隐私](legal/privacy.md) · [第三方来源与授权](legal/third-party-notices.md)

自动检查不代表已完成双语人工验收或所有电脑的实机测试。桌面部分衍生自 [LiveTranslate](https://github.com/rioX432/live-translate)，保留原作者 MIT 授权；模型另有各自授权。

</details>


## Copyright / 版權與使用

Free for noncommercial use. Commercial use and resale require permission. Derivative versions must credit VocaLume in their README and About interface. Third-party licenses remain unchanged.

原創部分免費供非商業使用；商用與轉售需事先取得書面同意。衍生版本須在 README 與關於介面註明來源。第三方原授權保留，舊版已授予的權利不受影響。詳見 [LICENSE](https://github.com/clark970417-eng/VocaLume/blob/main/LICENSE)。
