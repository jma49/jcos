---
title: ocra
description: Open-CR-Agent，开源的多 Agent 代码评审工具。流程由确定性的代码负责，LLM 评审只做需要判断的部分。
date: 2026-09
status: wip
order: 1
stack: [TypeScript, Node.js, OpenCode, LLM APIs]
repo: https://github.com/jma49/Open-CR-Agent
demo: https://ocra-nine.vercel.app/
cover: ../covers/ocra.jpg
---

ocra（Open-CR-Agent）用一组各有分工的 LLM 评审来审代码改动，但把它们放在一条确定性的流水线里：选文件、分组、匹配规则、把评论定位到具体行，这些都是普通的、有测试的代码；模型只负责需要判断的部分。

项目还在早期开发阶段，思路参考了 [Cloudflare 的 AI 代码评审](https://blog.cloudflare.com/ai-code-review/)和[阿里巴巴的 OpenCodeReview](https://github.com/alibaba/open-code-review)。

## 一次评审怎么跑

`ocra review` 会先挑出值得评审的文件，评估风险等级，把相关文件分成一组，再把每组交给一个只能读取当前版本代码的评审 Agent。评审引用它指的那段代码，由 ocra 把引用定位到准确的行号，而不是相信模型自己给的行号。每条问题都附带对应代码、依据，能修的话还有最小修改建议。

发现严重问题时退出码非零，可以直接用作 CI 卡点。每次运行都会记录事件日志和一份 JSON 报告。

## 设计取舍

- **准确优先。** 明确告诉评审哪些不要提：代码风格、没有依据的猜测和无关代码都不进结果。
- **任意模型，自动降级。** 每个档位配置一串模型，某个模型过载或额度用完时自动换下一个，持续失败的模型在本次运行里直接跳过。
- **成本看得见。** 每次运行都会列出输入、输出、推理和缓存的 Token 数，以及每次尝试的花费。
- **默认保护隐私。** 本地配置和说明文件不会发给模型，工具都是只读的。
- **一切皆插件。** 代码托管平台、Agent 运行时、评审、规则包、工具和事件监听共用同一套插件接口，可以按路径加团队规则，比如"接口处理函数必须校验租户归属"。

## 怎么衡量效果

`ocra-eval` 会重放 AACR-Bench 基准（200 个真实 PR，1,505 条经专家核实的评论），输出准确率、召回率、F1、成本和延迟。

评审运行在 [OpenCode](https://opencode.ai) 上，模型由你自己配置。项目使用 Apache-2.0 许可证。
