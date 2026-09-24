---
title: Assay
description: 开源的 PostgreSQL 数据检查工具。写好只读的 SQL 检查，定时运行，一眼看出哪里需要处理。
date: 2025-04
status: live
stack: [Next.js, TypeScript, PostgreSQL, MongoDB, Redis, Clerk]
repo: https://github.com/jma49/Assay
demo: https://sql-script-depoly.vercel.app/
cover: ../covers/assay.jpg
---

Assay 会定时对 PostgreSQL 数据库运行 SQL 检查，并标出哪些检查发现了问题，让脏数据在进入报表、影响用户之前就被发现。

## 能做什么

- 检查就是普通的 SQL，在带语法高亮和格式化的编辑器里编写。
- 通过 GitHub Actions 或 Vercel Cron 定时运行，每次运行的进度和历史记录都能在应用里查看。
- 全程只读：只允许 `SELECT`、`WITH` 和 `EXPLAIN`，运行前会先校验 SQL，每条查询都有超时限制。
- 通过 Clerk 登录，按邮箱域名和邀请控制谁能访问，敏感操作需要审批。
- 结果用 Redis 缓存，界面支持中英文切换。

## 演示

[在线演示](https://sql-script-depoly.vercel.app/)里有一个 `demo` 库，包含客户、订单、支付和库存几张表，里面故意埋了一些数据问题；另外有 11 条检查专门把它们找出来，比如重复订单和负库存。

## 技术栈

应用用 Next.js 和 TypeScript 开发；PostgreSQL 是被检查的数据库，MongoDB 存脚本和运行记录，Redis 做缓存，Clerk 负责登录。可以部署在 Vercel 上，也可以用 Docker 部署。
