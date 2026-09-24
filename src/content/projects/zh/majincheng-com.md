---
title: majincheng.com
description: 就是这个网站。用 Astro 做的中英双语个人主页，几乎不加载 JavaScript。
date: 2026-09
status: live
stack: [Astro, TypeScript, Tailwind CSS, Vercel]
repo: https://github.com/jma49/Jincheng-Protafolio
cover: ../covers/majincheng-com.jpg
demo: https://majincheng.com/zh/
---

我想要一个读起来像文章、而不是像控制台的个人主页，而且以后加项目要方便。

## 设计

版式参考了 [leerob.com](https://leerob.com)：全站一种衬线字体，正文一栏 600px，宽屏时旁边固定一张插画。没有导航栏，没有大标题区，也没有卡片网格。简介分简短和完整两版，工作经历的细节默认收起，点开才看得到。

## 内容

中英文内容放在同一个 TypeScript 文件里，所以两种语言的页面结构始终一致。项目是带类型校验的 Markdown 文件，每个项目自动生成中英文两个页面。

## 性能

- 页面上不跑任何前端框架。主题切换、简介切换和复制按钮都是几行内联脚本。
- 插画按屏幕宽度提供 AVIF 或 WebP，手机上大约 18 KB。
- 中文网络字体只在中文页面加载，而且只在系统没有中文衬线字体时才会用到。

## 部署

每次推送都由 Vercel 自动构建。PR 会有预览链接，合并到 `main` 后线上网站随之更新。
