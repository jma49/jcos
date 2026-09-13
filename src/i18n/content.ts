export type Lang = 'en' | 'zh';

export const LANGS: Lang[] = ['en', 'zh'];

export const profile = {
  name: { en: 'Jincheng Ma', zh: '马锦程' },
  handle: 'jma49',
  email: 'majincheng990128@gmail.com',
  phone: '(872) 239-9245',
  github: 'https://github.com/jma49',
  linkedin: 'https://www.linkedin.com/in/jinchengma',
  resume: '/Jincheng_Ma_Resume.pdf',
  location: { en: 'San Jose, California', zh: '美国加州 · 圣何塞' }
};

export const content = {
  en: {
    htmlLang: 'en',
    meta: {
      title: 'Jincheng Ma — Backend Software Engineer',
      description:
        'Backend software engineer in San Jose working on AI agent systems and distributed backends. Previously Trust & Safety at TikTok.'
    },
    nav: {
      work: 'Work',
      skills: 'Skills',
      about: 'About',
      contact: 'Contact',
      resume: 'Résumé',
      switchTo: '中文',
      switchLabel: 'Switch to Chinese'
    },
    hero: {
      eyebrow: 'Backend Software Engineer',
      // Rendered as inline-block chunks so line breaks only fall between them.
      // English needs no such control, so it stays a single chunk.
      headline: ['I build the systems that AI agents run on.'],
      lede: 'Backend engineer working at the seam between agent orchestration and production infrastructure — multi-agent pipelines that ship real code review in CI, Go services that answer in milliseconds, and the observability to prove both are working.',
      location: 'San Jose, CA',
      status: 'Open to backend & AI infrastructure roles',
      ctaPrimary: 'View my work',
      ctaSecondary: 'Download résumé'
    },
    stats: [
      { value: '30+', label: 'repos under automated agent review' },
      { value: '7', label: 'specialist agents per review, orchestrated' },
      { value: '30%', label: 'token spend cut through risk-tiered routing' },
      { value: '99.99%', label: 'inspection stability, up from 93.94%' }
    ],
    work: {
      title: 'Experience',
      subtitle: 'Three roles, one throughline: make the thing correct, then make it cheap.',
      details: 'What that involved',
      present: 'Present'
    },
    jobs: [
      {
        company: 'TikTok Inc.',
        role: 'Software Engineer, Trust & Safety',
        location: 'San Jose, CA',
        period: 'Jul 2025 — Sep 2026',
        summary:
          'Built and owned a CI-native multi-agent code review system, then the reliability work underneath the Trust & Safety product line.',
        tags: ['Multi-Agent Systems', 'LLM Orchestration', 'CI/CD', 'Observability', 'Go', 'Python'],
        bullets: [
          'Architected and shipped a CI-native multi-agent code review system reviewing every merge request across 30+ internal repositories, orchestrating OpenCode agent sessions behind a composable plugin architecture that isolates the VCS provider, the model provider, and internal engineering-standard checks.',
          'Engineered a coordinator agent that fans out to 7 concurrent domain specialists — security, performance, code quality, documentation, release, internal compliance — each in an isolated session, then adjudicates their output into one schema-validated review: deduplicating findings, re-categorizing misfiled ones, filtering speculative noise, and blocking the merge on any critical-severity issue.',
          'Calibrated the adjudication layer against reviewer judgment so severity calls stayed correct rather than merely consistent, using streaming JSONL telemetry for per-task token and cost attribution to compare model tiers and configurations on quality, latency, and cost per review.',
          'Cut per-review cost with risk-tiered orchestration that scales agent count and model tier to diff size, file count, and security-sensitive paths. Diff noise filtering plus a shared context file under prompt caching removed the 7× context duplication of a naive fan-out and reduced token spend over 30%. Hardened for CI with per-model circuit breakers and failback chains, multi-level timeouts, hung-session detection, and input sanitization closing prompt-injection paths into the coordinator.',
          'Owned end-to-end test automation for Trust & Safety products — backend API/integration and frontend E2E suites wired into CI/CD release gates — lifting P0/P1 regression automation from 80.21% to 95.82%; drove service reliability from production metrics and on-call trend analysis, cutting production issues by 30% and lifting inspection stability from 93.94% to 99.99%.',
          'Led a cross-region test-gap analysis across application code, runtime configuration, middleware, and third-party dependencies, cataloging 19 region-specific scenarios and 60 configuration sets and turning them into a layered validation strategy of configuration diff and snapshot checks, API/RPC assertions, and targeted E2E tests.'
        ]
      },
      {
        company: 'INFI.US',
        role: 'Software Engineer In Test',
        location: 'Chicago, IL',
        period: 'Jan 2025 — Jun 2025',
        summary:
          'Built internal tooling for data health and the automation framework that gated releases.',
        tags: ['Next.js', 'TypeScript', 'Playwright', 'SQL', 'CI/CD'],
        bullets: [
          'Built an internal data anomaly inspection platform (Next.js, TypeScript) running scheduled SQL checks across databases, with a dashboard for continuous visibility into data health and a webhook-based notification path pushing detected anomalies to team channels in real time.',
          'Built a Playwright E2E automation framework and Android workflows integrated with CI/CD, automating regression across core flows to improve release confidence.'
        ]
      },
      {
        company: 'Carrefour China (Suning.com)',
        role: 'Backend Software Engineer — Management Trainee Program',
        location: 'Nanjing, China',
        period: 'Jul 2021 — Jul 2023',
        summary:
          'Go services for a retail data platform: query APIs, access control, and the caching work that made them fast.',
        tags: ['Go', 'PostgreSQL', 'Redis', 'RBAC', 'OAuth 2.0', 'GitLab CI'],
        bullets: [
          'Developed and optimized RESTful query APIs in Go (net/http) for a retail data-middle-platform delivering self-service data query and BI, reaching 80 ms average response and 35% higher throughput via endpoint and concurrency tuning.',
          "Owned the platform's access-control module, designing role-based permission groups (RBAC) with OAuth 2.0 and JWT to govern which teams could query which datasets and dashboards.",
          'Accelerated retrieval with Redis caching (go-redis, 85% hit rate) and PostgreSQL tuning via pgx and strategic indexing, cutting critical query time by 40%; built CI/CD in GitLab CI (build, golangci-lint, go test, Docker) with automated API tests, cutting release cycle time 30%.'
        ]
      }
    ],
    skills: {
      title: 'Skills',
      subtitle: 'What I reach for, roughly in order of how often I reach for it.',
      groups: [
        {
          name: 'Languages',
          items: ['Go', 'Python', 'TypeScript', 'JavaScript', 'Java', 'SQL']
        },
        {
          name: 'AI & LLM',
          items: [
            'LLM Agents',
            'Multi-Agent Systems',
            'Agent Orchestration',
            'LLM Evaluation & Benchmarking',
            'Model Context Protocol (MCP)',
            'LLM API Integration',
            'AI Coding Tools',
            'LLM Observability'
          ]
        },
        {
          name: 'Backend & Distributed Systems',
          items: [
            'RESTful APIs',
            'gRPC',
            'Microservices',
            'Distributed Systems',
            'System Design',
            'Kafka',
            'Redis',
            'PostgreSQL',
            'MySQL',
            'Spring Boot',
            'Next.js',
            'React'
          ]
        },
        {
          name: 'Cloud & DevOps',
          items: [
            'AWS',
            'GCP',
            'Docker',
            'Kubernetes',
            'Linux',
            'Git',
            'GitHub Actions',
            'GitLab CI',
            'CI/CD',
            'Observability',
            'Agile / Scrum'
          ]
        },
        {
          name: 'Testing & Quality',
          items: [
            'Test Automation',
            'API Testing',
            'Integration Testing',
            'E2E Testing',
            'Regression Testing',
            'Playwright',
            'Pytest',
            'JUnit',
            'Postman',
            'Code Review'
          ]
        }
      ]
    },
    about: {
      title: 'About',
      paragraphs: [
        "I'm a backend engineer in San Jose. Most of my last two years went into one question: what does it take for an LLM agent to do real work inside a production pipeline, on every merge request, without a human babysitting it?",
        'The honest answer turned out to be mostly infrastructure. A fan-out of seven specialists is easy; making their output trustworthy is not. The work that mattered was the adjudication layer — deduplicating, re-categorizing, filtering speculative noise — and the boring parts around it: circuit breakers, timeouts, hung-session detection, input sanitization, and per-task cost telemetry that turned "which model should we use" from an argument into a measurement.',
        'Before agents I wrote Go for a retail data platform serving self-service query and BI, where the same instinct applied: get the API correct, then get it to 80 ms. I came to the US for a master’s at Illinois Tech and stayed for the systems work.',
        'Outside of work I read about distributed systems, follow markets more closely than is strictly healthy, and keep a running list of things I want to build.'
      ]
    },
    education: {
      title: 'Education',
      items: [
        {
          school: 'Illinois Institute of Technology',
          degree: 'M.S., Information Technology & Management',
          detail: 'GPA 4.0 / 4.0',
          period: 'Dec 2024',
          location: 'Chicago, IL'
        },
        {
          school: 'Nanjing University of Technology',
          degree: 'B.E., Engineering',
          detail: 'Double major: Human Resource Management',
          period: 'May 2021',
          location: 'Nanjing, China'
        }
      ]
    },
    contact: {
      title: 'Get in touch',
      lede: "I'm open to backend and AI infrastructure roles, and always happy to talk about agent systems, Go, or anything that has to stay up at 3 a.m.",
      emailLabel: 'Email',
      githubLabel: 'GitHub',
      linkedinLabel: 'LinkedIn',
      resumeLabel: 'Résumé (PDF)',
      copy: 'Copy',
      copied: 'Copied'
    },
    footer: {
      built: 'Built with Astro, React and Tailwind.',
      source: 'Source on GitHub'
    }
  },

  zh: {
    htmlLang: 'zh-CN',
    meta: {
      title: '马锦程 — 后端软件工程师',
      description:
        '常驻美国加州圣何塞的后端工程师，专注 AI Agent 系统与分布式后端。曾任职于 TikTok 信任与安全团队。'
    },
    nav: {
      work: '经历',
      skills: '技能',
      about: '关于',
      contact: '联系',
      resume: '简历',
      switchTo: 'EN',
      switchLabel: '切换到英文'
    },
    hero: {
      eyebrow: '后端软件工程师',
      headline: ['我做的是\u00A0AI\u00A0Agent\u00A0', '跑起来所依赖的', '那层系统。'],
      lede: '我的工作在 Agent 编排与生产基础设施的接缝处：让多智能体流水线在 CI 里真正承担代码评审，让 Go 服务在毫秒级返回，并用可观测性证明这两件事确实成立。',
      location: '美国加州 · 圣何塞',
      status: '正在寻找后端 / AI 基础设施方向的机会',
      ctaPrimary: '查看工作经历',
      ctaSecondary: '下载简历'
    },
    stats: [
      { value: '30+', label: '个内部仓库接入自动化 Agent 评审' },
      { value: '7', label: '个领域专家 Agent 并发编排' },
      { value: '30%', label: 'Token 成本削减（风险分级路由）' },
      { value: '99.99%', label: '巡检稳定性，此前为 93.94%' }
    ],
    work: {
      title: '工作经历',
      subtitle: '三段经历，一条主线：先把事情做对，再把它做便宜。',
      details: '具体做了什么',
      present: '至今'
    },
    jobs: [
      {
        company: 'TikTok Inc.',
        role: '软件工程师 · 信任与安全',
        location: '美国加州 · 圣何塞',
        period: '2025.07 — 2026.09',
        summary:
          '从零搭建并负责一套 CI 原生的多智能体代码评审系统，同时承担信任与安全产品线底层的质量与稳定性工作。',
        tags: ['多智能体系统', 'LLM 编排', 'CI/CD', '可观测性', 'Go', 'Python'],
        bullets: [
          '设计并落地了一套 CI 原生的多智能体代码评审系统，覆盖 30+ 内部仓库的每一个合并请求。系统以可组合的插件架构编排 OpenCode Agent 会话，将版本控制平台、模型供应商与公司内部工程规范检查三者彻底解耦。',
          '实现了一个协调者 Agent：向 7 个领域专家（安全、性能、代码质量、文档、发布、内部合规）并发分发任务，每个运行在独立会话中，再将它们的输出裁决为一份通过 Schema 校验的统一评审——去重、纠正错误归类、过滤推测性噪音，并在出现任意 critical 级别问题时阻断合并。',
          '以人类评审者的判断为基准校准裁决层，确保严重性判定不只是「前后一致」而是「判断正确」；通过流式 JSONL 遥测做到按任务粒度的 Token 与成本归因，从而在质量、延迟、单次评审成本三个维度上横向比较不同模型档位与配置。',
          '通过风险分级编排降低单次评审成本：根据 diff 规模、文件数量与安全敏感路径动态调整 Agent 数量与模型档位。结合 diff 噪音过滤和 Prompt Caching 下的共享上下文文件，消除了朴素并发扇出带来的 7 倍上下文重复，Token 开销下降超过 30%。并为 CI 场景做了加固：按模型维度的熔断器与降级链路、多级超时、挂死会话检测，以及封堵注入路径的输入净化。',
          '端到端负责信任与安全产品的测试自动化，构建后端 API / 集成测试与前端 E2E 套件并接入 CI/CD 发布卡点，将 P0/P1 回归自动化率从 80.21% 提升至 95.82%；以生产指标与 On-call 趋势分析驱动服务可靠性建设，线上问题减少 30%，巡检稳定性从 93.94% 提升至 99.99%。',
          '主导跨区域测试盲区分析，覆盖应用代码、运行时配置、中间件与第三方依赖，梳理出 19 个区域特定场景与 60 组配置集合，并将其转化为分层校验策略：配置 diff 与快照检查、API/RPC 断言，以及针对性的 E2E 测试。'
        ]
      },
      {
        company: 'INFI.US',
        role: '测试开发工程师',
        location: '美国伊利诺伊州 · 芝加哥',
        period: '2025.01 — 2025.06',
        summary: '搭建内部数据健康度平台，以及为发布把关的自动化测试框架。',
        tags: ['Next.js', 'TypeScript', 'Playwright', 'SQL', 'CI/CD'],
        bullets: [
          '搭建了一套内部数据异常巡检平台（Next.js + TypeScript），跨库执行定时 SQL 检查，配套仪表盘持续呈现数据健康状况，并通过 Webhook 将检测到的异常实时推送至团队频道。',
          '构建 Playwright E2E 自动化框架与 Android 测试流程并接入 CI/CD，实现核心链路的回归自动化，提升发布信心。'
        ]
      },
      {
        company: '家乐福中国（苏宁易购）',
        role: '后端软件工程师 · 管培生项目',
        location: '中国 · 南京',
        period: '2021.07 — 2023.07',
        summary: '零售数据中台的 Go 服务：查询 API、权限体系，以及让它们跑得够快的缓存工作。',
        tags: ['Go', 'PostgreSQL', 'Redis', 'RBAC', 'OAuth 2.0', 'GitLab CI'],
        bullets: [
          '为零售数据中台开发并优化 Go（net/http）RESTful 查询 API，支撑自助数据查询与 BI 能力；通过接口与并发调优，平均响应达到 80 ms，吞吐量提升 35%。',
          '负责平台的访问控制模块，基于 OAuth 2.0 与 JWT 设计基于角色的权限组（RBAC），管控各团队对数据集与看板的查询边界。',
          '通过 Redis 缓存（go-redis，命中率 85%）与 PostgreSQL 调优（pgx、针对性索引）加速数据检索，关键查询耗时下降 40%；在 GitLab CI 上搭建 CI/CD 流水线（构建、golangci-lint、go test、Docker）并接入自动化 API 测试，发布周期缩短 30%。'
        ]
      }
    ],
    skills: {
      title: '技能',
      subtitle: '日常真正用得上的东西，大致按使用频率排列。',
      groups: [
        {
          name: '编程语言',
          items: ['Go', 'Python', 'TypeScript', 'JavaScript', 'Java', 'SQL']
        },
        {
          name: 'AI 与大模型',
          items: [
            'LLM Agent',
            '多智能体系统',
            'Agent 编排',
            'LLM 评测与基准',
            'Model Context Protocol (MCP)',
            'LLM API 集成',
            'AI 编程工具',
            'LLM 可观测性'
          ]
        },
        {
          name: '后端与分布式系统',
          items: [
            'RESTful API',
            'gRPC',
            '微服务',
            '分布式系统',
            '系统设计',
            'Kafka',
            'Redis',
            'PostgreSQL',
            'MySQL',
            'Spring Boot',
            'Next.js',
            'React'
          ]
        },
        {
          name: '云与 DevOps',
          items: [
            'AWS',
            'GCP',
            'Docker',
            'Kubernetes',
            'Linux',
            'Git',
            'GitHub Actions',
            'GitLab CI',
            'CI/CD',
            '可观测性',
            '敏捷 / Scrum'
          ]
        },
        {
          name: '测试与质量',
          items: [
            '测试自动化',
            'API 测试',
            '集成测试',
            'E2E 测试',
            '回归测试',
            'Playwright',
            'Pytest',
            'JUnit',
            'Postman',
            '代码评审'
          ]
        }
      ]
    },
    about: {
      title: '关于我',
      paragraphs: [
        '我是一名常驻圣何塞的后端工程师。过去两年，我的大部分精力都花在同一个问题上：要让一个 LLM Agent 在生产流水线里、对每一个合并请求做真正有效的工作，而且无需人盯着，究竟需要什么？',
        '诚实的答案是：绝大部分是基础设施。并发扇出七个专家 Agent 并不难，难的是让它们的输出值得信任。真正关键的是裁决层——去重、纠正归类、过滤推测性噪音——以及围绕它那些不起眼的部分：熔断器、超时、挂死会话检测、输入净化，还有按任务粒度的成本遥测，它把「我们该用哪个模型」从一场争论变成了一次测量。',
        '在做 Agent 之前，我为一个零售数据中台写 Go，支撑自助查询与 BI，当时的直觉是一样的：先把 API 做对，再把它做到 80 毫秒。我为了在伊利诺伊理工读硕士来到美国，然后因为喜欢做系统而留了下来。',
        '工作之外，我读分布式系统相关的东西，关注市场的程度大概超出了健康范围，并且始终维护着一份「想做的东西」的清单。'
      ]
    },
    education: {
      title: '教育背景',
      items: [
        {
          school: '伊利诺伊理工大学',
          degree: '信息技术与管理 硕士',
          detail: 'GPA 4.0 / 4.0',
          period: '2024.12',
          location: '美国 · 芝加哥'
        },
        {
          school: '南京工业大学',
          degree: '工学 学士',
          detail: '双学位：人力资源管理',
          period: '2021.05',
          location: '中国 · 南京'
        }
      ]
    },
    contact: {
      title: '联系我',
      lede: '我正在寻找后端与 AI 基础设施方向的机会，也很乐意聊聊 Agent 系统、Go，或者任何需要在凌晨三点保持在线的东西。',
      emailLabel: '邮箱',
      githubLabel: 'GitHub',
      linkedinLabel: '领英',
      resumeLabel: '简历（PDF）',
      copy: '复制',
      copied: '已复制'
    },
    footer: {
      built: '使用 Astro、React 与 Tailwind 构建。',
      source: '在 GitHub 查看源码'
    }
  }
} as const;

export type Content = (typeof content)[Lang];
