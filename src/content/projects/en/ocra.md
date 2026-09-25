---
title: ocra
description: Open-CR-Agent, an open-source multi-agent code review tool. Deterministic code handles the pipeline; LLM reviewers only make the calls that need judgment.
date: 2026-09
status: wip
order: 1
stack: [TypeScript, Node.js, OpenCode, LLM APIs]
repo: https://github.com/jma49/Open-CR-Agent
demo: https://ocra-nine.vercel.app/
cover: ../covers/ocra.jpg
capture: https://ocra-nine.vercel.app/
---

ocra (Open-CR-Agent) reviews code changes with a set of specialised LLM reviewers inside a deterministic pipeline. File selection, grouping, rule matching and anchoring comments to lines are ordinary, tested code; the models are only asked for judgment.

It's in early development and inspired by [Cloudflare's AI code review](https://blog.cloudflare.com/ai-code-review/) and [Alibaba OpenCodeReview](https://github.com/alibaba/open-code-review).

## How a review runs

`ocra review` selects the files worth reviewing, assigns a risk tier, groups related files, and gives each group to a reviewer agent that can only read the revision under review. Reviewers quote the code they mean, and ocra resolves the quote to exact lines instead of trusting a model's line numbers. Each finding comes with the code, the evidence and, when there is one, a minimal fix.

The exit code is non-zero when there are critical findings, so it can gate CI. Each run writes an event log and a JSON report.

## Design choices

- **Precision first.** Reviewers are told what not to flag: style nits, speculation and unrelated code stay out of the review.
- **Any model, with failback.** Models are configured per tier as a chain. When one is overloaded or out of quota, the task moves to the next, and a model that keeps failing is skipped for the rest of the run.
- **Visible cost.** Every run reports input, output, reasoning and cached tokens and the cost of each attempt.
- **Private by default.** Local config and instruction files never reach the model, and tools are read-only.
- **Plugins throughout.** Code hosts, agent runtimes, reviewers, rule packs, tools and event listeners share one plugin contract, so team rules like "handlers must check tenant ownership" can be added per path.

## Measuring it

`ocra-eval` replays the AACR-Bench benchmark (200 real pull requests with 1,505 expert-verified comments) and reports precision, recall, F1, cost and latency.

Reviews run on [OpenCode](https://opencode.ai) with the models you configure. The project is Apache-2.0 licensed.
