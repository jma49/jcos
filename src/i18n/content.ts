export type Lang = 'en' | 'zh';

export const LANGS: Lang[] = ['en', 'zh'];

export const profile = {
  name: { en: 'Jincheng Ma', zh: '马锦程' },
  handle: 'jma49',
  email: 'majincheng990128@gmail.com',
  github: 'https://github.com/jma49',
  linkedin: 'https://www.linkedin.com/in/jinchengma',
  photography: 'https://unsplash.com/@jincheng_1999',
  location: { en: 'San Jose, California', zh: '美国加州 · 圣何塞' }
};

// Bio paragraphs support inline links written as [text](url).
export const content = {
  en: {
    htmlLang: 'en',
    meta: {
      title: 'Jincheng Ma — Software Engineer',
      description:
        'Jincheng Ma is a software engineer in San Jose. Previously at TikTok (Trust & Safety) and INFI.US.'
    },
    ui: {
      switchTo: '中文',
      switchLabel: 'Switch to Chinese',
      theme: 'Toggle color theme',
      details: 'Details',
      copy: 'Copy',
      copied: 'Copied',
      illustrationAlt:
        'An illustration of the Golden Gate Bridge with the San Francisco skyline behind it and a sailboat on the bay.'
    },
    role: 'Software Engineer',
    bio: {
      label: 'Bio',
      short: 'Default',
      long: 'Long',
      shortParagraphs: [
        "I'm a software engineer in San Jose. Most recently I was on TikTok's Trust & Safety team, working on test automation and release quality. I also built an LLM code review tool that runs in CI across 30+ internal repositories.",
        "Before that I was at INFI.US in Chicago, building internal data-quality tooling, and finished my master's at Illinois Tech. I'm currently looking for software engineering roles.",
        'Outside of work I boulder, currently at V6, and take photos. Some of my photos are on [Unsplash](https://unsplash.com/@jincheng_1999).'
      ],
      longParagraphs: [
        "I'm a software engineer in San Jose. Most recently I was a Software Engineer in Test on TikTok's Trust & Safety team.",
        'Most of that job was testing: backend API, integration and E2E suites that run as release gates in CI, plus using production metrics and on-call data to decide what to cover next. Over the year, P0/P1 regression automation went from 80% to 96%, and production issues dropped by about 30%.',
        'I also built the LLM code review tool the team uses in CI. It runs a few reviewers in parallel on each merge request and merges their findings into one review. Most of the work was making it cheap and predictable enough to run on every merge request: smaller context, fallbacks between models, timeouts, and tracking cost per review.',
        'Before TikTok I spent six months at INFI.US in Chicago on internal data-quality tooling and Playwright tests. I finished my M.S. at Illinois Tech in 2024.',
        "I'm currently looking for software engineering roles. Outside of work I boulder (currently V6), take photos, some of which are on [Unsplash](https://unsplash.com/@jincheng_1999), and follow the markets."
      ]
    },
    work: {
      title: 'Experience'
    },
    jobs: [
      {
        company: 'TikTok',
        role: 'Software Engineer in Test, Trust & Safety',
        location: 'San Jose, CA',
        period: 'Jul 2025 – Sep 2026',
        summary:
          'Test automation and release quality for Trust & Safety products, and an LLM code review tool used across 30+ repositories.',
        bullets: [
          'Owned test automation for Trust & Safety products: backend API and integration tests, and frontend E2E suites, run as release gates in CI/CD. P0/P1 regression automation went from 80.21% to 95.82%.',
          'Used production metrics and on-call trends to decide where to add tests and monitoring. Production issues dropped by 30%, and inspection stability went from 93.94% to 99.99%.',
          'Mapped testing gaps across regions in app code, runtime config, middleware and third-party dependencies. Found 19 region-specific scenarios and 60 config sets, and covered them with config diff and snapshot checks, API/RPC assertions, and targeted E2E tests.',
          'Built an LLM code review tool that runs in CI on every merge request across 30+ internal repositories. A coordinator runs 7 reviewers in parallel (security, performance, code quality, docs, release, internal standards), merges and de-duplicates their findings, and blocks the merge on critical issues.',
          'Kept it affordable and stable: the number of reviewers and the model tier depend on diff size and sensitive paths, reviewers share one cached context file instead of each getting a copy (token spend down 30%+), and each run has timeouts, model fallbacks, and input sanitization against prompt injection.'
        ]
      },
      {
        company: 'INFI.US',
        role: 'Software Engineer in Test',
        location: 'Chicago, IL',
        period: 'Jan 2025 – Jun 2025',
        summary: 'Internal data-quality tooling and the E2E tests used for releases.',
        bullets: [
          'Built an internal tool (Next.js, TypeScript) that runs 150+ scheduled SQL checks a day over 50+ tables in several databases, shows the results on a dashboard, and posts anomalies to team channels through webhooks.',
          'Set up a Playwright E2E framework and Android test flows in CI/CD for regression testing of core flows.'
        ]
      },
      {
        company: 'Carrefour China (Suning.com)',
        role: 'Backend Software Engineer, Management Trainee Program',
        location: 'Shanghai, China',
        period: 'Jul 2021 – Mar 2022',
        summary: 'Go backend services for a retail data platform.',
        bullets: [
          'Built and tuned REST query APIs in Go for a data platform used for self-service queries and BI. Average response time was 80 ms, and throughput went up 35% after endpoint and concurrency tuning.',
          'Owned access control: role-based permission groups with OAuth 2.0 and JWT, deciding which teams could query which datasets and dashboards.',
          'Added Redis caching (85% hit rate) and PostgreSQL index tuning, which cut key query times by 40%. Set up GitLab CI (build, lint, test, Docker) with automated API tests, which shortened the release cycle by 30%.'
        ]
      }
    ],
    skills: {
      title: 'Skills',
      groups: [
        { name: 'Languages', items: ['Go', 'Python', 'TypeScript', 'Java', 'SQL'] },
        {
          name: 'Backend',
          items: ['REST', 'gRPC', 'PostgreSQL', 'MySQL', 'Redis', 'Kafka', 'Next.js']
        },
        {
          name: 'Testing',
          items: ['Playwright', 'Pytest', 'JUnit', 'API & integration testing', 'E2E testing']
        },
        {
          name: 'Infrastructure',
          items: ['Docker', 'Kubernetes', 'AWS', 'GCP', 'GitHub Actions', 'GitLab CI']
        },
        {
          name: 'LLM tooling',
          items: ['LLM APIs', 'Multi-agent workflows', 'MCP', 'LLM evaluation']
        }
      ]
    },
    education: {
      title: 'Education',
      items: [
        {
          school: 'Illinois Institute of Technology',
          degree: 'M.S., Information Technology & Management · GPA 4.0',
          period: '2024'
        },
        {
          school: 'Nanjing University of Technology',
          degree: 'B.E., Materials Science and Engineering · Double major in Human Resource Management',
          period: '2021'
        }
      ]
    },
    links: {
      title: 'Links',
      email: 'Email',
      github: 'GitHub',
      linkedin: 'LinkedIn',
      resume: 'Résumé (PDF)',
      resumeHref: '/Jincheng_Ma_Resume.pdf',
      photography: 'Photography'
    },
    footer: {
      source: 'Source'
    }
  },

  zh: {
    htmlLang: 'zh-CN',
    meta: {
      title: '马锦程 — 软件工程师',
      description:
        '马锦程，圣何塞的软件工程师。曾就职于 TikTok 信任与安全团队和 INFI.US。'
    },
    ui: {
      switchTo: 'EN',
      switchLabel: '切换到英文',
      theme: '切换深浅色',
      details: '详细',
      copy: '复制',
      copied: '已复制',
      illustrationAlt: '金门大桥插画，背后是旧金山的城市天际线，海湾上有一艘帆船。'
    },
    role: '软件工程师',
    bio: {
      label: '简介',
      short: '简短',
      long: '完整',
      shortParagraphs: [
        '我是马锦程，在圣何塞做软件工程师。上一份工作在 TikTok 信任与安全团队，负责测试自动化和发布质量，也做了一个在 CI 里运行的 LLM 代码评审工具，覆盖 30 多个内部仓库。',
        '在这之前，我在芝加哥的 INFI.US 做内部数据质量工具，也在伊利诺伊理工读完了硕士。目前在找软件工程师的工作。',
        '工作之外我喜欢抱石，目前能爬 V6；也喜欢拍照，部分作品放在 [Unsplash](https://unsplash.com/@jincheng_1999) 上。'
      ],
      longParagraphs: [
        '我是马锦程，在圣何塞做软件工程师。上一份工作是 TikTok 信任与安全团队的测试开发工程师。',
        '那份工作主要是测试：后端 API 测试、集成测试和 E2E 测试，接在 CI 里作为发布卡点；再根据线上指标和 On-call 记录决定下一步补哪些测试。一年里，P0/P1 回归自动化率从 80% 提到了 96%，线上问题减少了约 30%。',
        '我还做了团队在 CI 里用的 LLM 代码评审工具。每个合并请求会并行跑几个评审，再把结果合并成一份。大部分功夫花在让它足够便宜、足够稳定，能在每个合并请求上跑：压缩上下文、模型之间的降级、超时，以及统计每次评审的成本。',
        '在 TikTok 之前，我在芝加哥的 INFI.US 待了半年，独立做了一个内部数据质量平台，也写 Playwright 测试。2024 年从伊利诺伊理工硕士毕业。',
        '目前在找软件工程师的工作。工作之外我喜欢抱石，目前能爬 V6；也喜欢拍照，部分作品在 [Unsplash](https://unsplash.com/@jincheng_1999) 上；平时也关注股市。'
      ]
    },
    work: {
      title: '工作经历'
    },
    jobs: [
      {
        company: 'TikTok',
        role: '测试开发工程师 · 信任与安全',
        location: '美国加州 · 圣何塞',
        period: '2025.07 – 2026.09',
        summary:
          '负责信任与安全产品的测试自动化和发布质量，并做了一个覆盖 30 多个仓库的 LLM 代码评审工具。',
        bullets: [
          '负责信任与安全产品的测试自动化：后端 API 测试、集成测试和前端 E2E 测试，接入 CI/CD 作为发布卡点。P0/P1 回归自动化率从 80.21% 提升到 95.82%。',
          '根据线上指标和 On-call 趋势决定在哪里补测试和监控。线上问题减少 30%，巡检稳定性从 93.94% 提升到 99.99%。',
          '梳理跨区域的测试盲区，覆盖应用代码、运行时配置、中间件和第三方依赖。整理出 19 个区域特有场景和 60 组配置，用配置 diff 与快照检查、API/RPC 断言和针对性的 E2E 测试覆盖。',
          '做了一个在 CI 里运行的 LLM 代码评审工具，覆盖 30 多个内部仓库的每个合并请求。协调器并行运行 7 个评审（安全、性能、代码质量、文档、发布、内部规范），合并去重后输出一份结果，发现严重问题时阻止合并。',
          '控制成本和稳定性：根据 diff 大小和敏感路径决定评审数量和模型档位；评审共用一份缓存的上下文文件，不再各自复制一份，Token 开销降低 30% 以上；每次运行都有超时、模型降级和防提示注入的输入过滤。'
        ]
      },
      {
        company: 'INFI.US',
        role: '软件工程师',
        location: '美国伊利诺伊州 · 芝加哥',
        period: '2025.01 – 2025.06',
        summary: '内部数据质量工具，以及发布用的 E2E 测试。',
        bullets: [
          '用 Next.js 和 TypeScript 做了一个内部工具：每天定时对 50 多张表执行 150 多条 SQL 检查，在仪表盘上展示结果，并通过 Webhook 把异常推送到团队频道。',
          '搭建 Playwright E2E 框架和 Android 测试流程，接入 CI/CD，用于核心流程的回归测试。'
        ]
      },
      {
        company: '家乐福中国（苏宁易购）',
        role: '后端开发工程师 · 管培生项目',
        location: '中国 · 上海',
        period: '2021.07 – 2022.03',
        summary: '零售数据平台的 Go 后端服务。',
        bullets: [
          '用 Go 开发和优化数据平台的 REST 查询接口，支持自助查询和 BI。平均响应时间 80 ms，经过接口和并发调优后吞吐量提升 35%。',
          '负责权限模块：基于 OAuth 2.0 和 JWT 设计角色权限组，控制各团队能查询哪些数据集和看板。',
          '引入 Redis 缓存（命中率 85%）并优化 PostgreSQL 索引，关键查询耗时降低 40%。在 GitLab CI 上搭建构建、Lint、测试和 Docker 流水线，加入自动化 API 测试，发布周期缩短 30%。'
        ]
      }
    ],
    skills: {
      title: '技能',
      groups: [
        { name: '语言', items: ['Go', 'Python', 'TypeScript', 'Java', 'SQL'] },
        {
          name: '后端',
          items: ['REST', 'gRPC', 'PostgreSQL', 'MySQL', 'Redis', 'Kafka', 'Next.js']
        },
        {
          name: '测试',
          items: ['Playwright', 'Pytest', 'JUnit', 'API 与集成测试', 'E2E 测试']
        },
        {
          name: '基础设施',
          items: ['Docker', 'Kubernetes', 'AWS', 'GCP', 'GitHub Actions', 'GitLab CI']
        },
        { name: 'LLM 工具', items: ['LLM API', '多 Agent 工作流', 'MCP', 'LLM 评测'] }
      ]
    },
    education: {
      title: '教育',
      items: [
        {
          school: '伊利诺伊理工大学',
          degree: '信息技术与管理 硕士 · GPA 4.0',
          period: '2024'
        },
        {
          school: '南京工业大学',
          degree: '无机非金属材料工程 本科 · 双学位：人力资源管理',
          period: '2021'
        }
      ]
    },
    links: {
      title: '链接',
      email: '邮箱',
      github: 'GitHub',
      linkedin: '领英',
      resume: '简历（PDF）',
      resumeHref: '/Jincheng_Ma_Resume_CN.pdf',
      photography: '摄影作品'
    },
    footer: {
      source: '源码'
    }
  }
} as const;

export type Content = (typeof content)[Lang];
