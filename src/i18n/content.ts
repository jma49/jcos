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
        '马锦程，湾区软件工程师，曾在 TikTok 信任与安全团队和 INFI.US 工作。'
    },
    ui: {
      switchTo: 'EN',
      switchLabel: '切换到英文',
      theme: '切换深浅色',
      details: '展开',
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
        '我叫马锦程，在湾区做软件工程师。上一份工作在 TikTok 信任与安全团队，主要负责测试自动化，给产品发布把关；另外写了一套 LLM 代码评审工具，接进了 30 多个内部仓库的 CI。',
        '再往前，我在芝加哥的 INFI.US 做内部数据平台，硕士也是在芝加哥的伊利诺伊理工读的。现在正在找新的软件工程师工作。',
        '工作之外，我是个抱石爱好者，目前在爬 V6；也爱拍照，一些作品放在 [Unsplash](https://unsplash.com/@jincheng_1999) 上。'
      ],
      longParagraphs: [
        '我叫马锦程，在湾区做软件工程师，上一份工作是 TikTok 信任与安全团队的测试开发工程师。',
        '在 TikTok 的主要工作是测试：后端接口、集成和 E2E 测试，都接在 CI 里当发布卡点。测试往哪补，基本看线上指标和 On-call 记录来定。一年下来，P0/P1 回归自动化率从 80% 提到了 96%，线上问题少了三成左右。',
        '我还给团队写了一套 LLM 代码评审工具：每个合并请求会同时跑几个评审，最后汇总成一份意见。最花时间的是让它便宜、稳定到每个合并请求都能跑：压缩上下文、模型互为备份、设置超时，再把每次评审的成本算清楚。',
        '来 TikTok 之前，我在芝加哥的 INFI.US 待了半年，一个人把内部数据质量平台从零做了出来，也写了 Playwright 测试。2024 年从伊利诺伊理工硕士毕业。',
        '现在正在找新的软件工程师工作。平时是个抱石爱好者，目前在爬 V6；也爱拍照，一些作品放在 [Unsplash](https://unsplash.com/@jincheng_1999) 上；另外会关注股市。'
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
          '给信任与安全产品做测试自动化、把关发布质量，另外写了一套覆盖 30 多个仓库的 LLM 代码评审工具。',
        bullets: [
          '负责信任与安全产品的测试自动化，包括后端接口、集成测试和前端 E2E，全部接入 CI/CD 作为发布卡点。P0/P1 回归自动化率从 80.21% 提升到 95.82%。',
          '依据线上指标和 On-call 趋势决定测试和监控往哪补，线上问题减少 30%，巡检稳定性从 93.94% 提升到 99.99%。',
          '排查不同区域部署之间的测试盲区，范围包括应用代码、运行时配置、中间件和第三方依赖。梳理出 19 类区域特有场景和 60 组配置，再用配置 diff 与快照检查、API/RPC 断言和针对性的 E2E 测试逐一覆盖。',
          '写了一套在 CI 里运行的 LLM 代码评审工具，覆盖 30 多个内部仓库的全部合并请求。由一个协调器同时调起 7 个评审，分别看安全、性能、代码质量、文档、发布和内部规范，汇总去重后给出一份结论；遇到严重问题直接拦下合并。',
          '在成本和稳定性上，按 diff 大小和敏感路径决定开几个评审、用哪档模型；几个评审共用一份缓存好的上下文，不再各拷一份，Token 开销降了 30% 以上；每次运行都设了超时和模型降级，并过滤输入以防提示注入。'
        ]
      },
      {
        company: 'INFI.US',
        role: '软件工程师',
        location: '美国伊利诺伊州 · 芝加哥',
        period: '2025.01 – 2025.06',
        summary: '从零做了内部数据质量平台，也负责发布前的 E2E 测试。',
        bullets: [
          '用 Next.js 和 TypeScript 做了内部数据质量平台：每天定时对 50 多张表跑 150 多条 SQL 检查，结果汇总到看板上，发现异常就通过 Webhook 推送到团队频道。',
          '搭建 Playwright E2E 框架和 Android 端测试流程，接入 CI/CD，覆盖核心流程的回归。'
        ]
      },
      {
        company: '家乐福中国（苏宁易购）',
        role: '后端开发工程师 · 管培生项目',
        location: '中国 · 上海',
        period: '2021.07 – 2022.03',
        summary: '给零售数据平台写 Go 后端。',
        bullets: [
          '用 Go 开发、调优数据平台的 REST 查询接口，支撑自助查询和 BI。平均响应 80 ms，经过接口和并发调优，吞吐提升 35%。',
          '负责权限模块，基于 OAuth 2.0 和 JWT 设计角色权限组，管住哪些团队能查哪些数据集和看板。',
          '加了 Redis 缓存（命中率 85%），又优化了 PostgreSQL 索引，关键查询耗时降低 40%。在 GitLab CI 上搭了构建、Lint、测试、Docker 的流水线，加上接口自动化测试，发布周期缩短 30%。'
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
      title: '教育经历',
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
