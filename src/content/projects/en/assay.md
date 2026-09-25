---
title: Assay
description: Open-source SQL data checks for PostgreSQL. Write read-only checks, run them on a schedule, and see what needs attention.
date: 2025-04
status: live
order: 2
stack: [Next.js, TypeScript, PostgreSQL, MongoDB, Redis, Clerk]
repo: https://github.com/jma49/Assay
demo: https://assay-sql.vercel.app/
cover: ../covers/assay.jpg
capture: https://assay-sql.vercel.app/
---

Assay runs SQL checks against a PostgreSQL database on a schedule and shows which ones found problems, so bad data gets caught before it reaches reports or customers.

## What it does

- Checks are plain SQL, written in an editor with syntax highlighting and formatting.
- They run on a schedule through GitHub Actions or Vercel Cron. Each run's progress and history are visible in the app.
- Everything is read-only. Only `SELECT`, `WITH` and `EXPLAIN` are allowed, queries are validated before they run, and each one has a timeout.
- Sign-in goes through Clerk, limited by email domain and invitation, with an approval step for sensitive changes.
- Results are cached in Redis, and the interface is available in English and Chinese.

## Demo

The [live demo](https://assay-sql.vercel.app/) uses a `demo` schema of customers, orders, payments and inventory with data problems planted in it, plus 11 checks that find them, such as duplicate orders and negative inventory.

## How it's built

Next.js and TypeScript for the app, PostgreSQL as the database being checked, MongoDB for scripts and run history, Redis for caching, and Clerk for authentication. It can be deployed on Vercel or with Docker.
