# Design System

## Theme

浅色技术档案。纸张感中性色承载长文，深墨色建立结构，低饱和蓝与锈色仅用于链接、证据类型和重点提示。

## Colors

- Paper: `#f2efe7`
- Paper secondary: `#e8e3d8`
- Ink: `#172024`
- Muted: `#59656a`
- Rule: `#c8c3b8`
- Blue: `#174f68`
- Blue soft: `#dce8eb`
- Rust: `#985333`
- Rust soft: `#eee0d6`

## Typography

- 正文：`Inter`, `Noto Sans SC`, `Microsoft YaHei`, sans-serif
- 标题：`Noto Serif SC`, `Songti SC`, serif
- 技术标签与代码：`SFMono-Regular`, `Consolas`, monospace
- 正文行宽控制在 65–75ch，行高约 1.7。

## Layout

- 顶部粘性导航，最大宽度约 1580px。
- 证据墙允许宽屏展开；分析长文使用窄正文列和独立目录列。
- 主要分隔依靠规则线、留白和背景层次，不使用圆角卡片堆叠。
- 375px 下改为单列，导航可横向滚动。

## Components

- Topbar：纸张背景、细底线、等宽品牌标签。
- Hero：大号宋体标题、短引言、必要时配侧栏目录。
- Article：段落、代码块、引用块按原始文档顺序呈现。
- Code block：深墨背景、浅纸色文字，可横向滚动。
- Links：低饱和蓝，清晰 hover 与 focus-visible。
- Footer：细规则线分隔，提供站内返回和源码入口。

## Motion

仅使用颜色、背景、opacity 或 transform 的短反馈；尊重 `prefers-reduced-motion`。
