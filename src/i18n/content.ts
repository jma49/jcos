export type Lang = 'en' | 'zh';

export const LANGS: Lang[] = ['en', 'zh'];

export const profile = {
  name: { en: 'Jincheng Ma', zh: '马锦程' },
  handle: 'jma49',
  email: 'majincheng990128@gmail.com',
  github: 'https://github.com/jma49',
  linkedin: 'https://www.linkedin.com/in/jincheng-ma-professional',
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
        'Jincheng Ma is a software engineer in the Bay Area who builds developer tooling and brings AI agents into code review, testing and release.'
    },
    ui: {
      switchTo: '中文',
      switchLabel: 'Switch to Chinese',
      theme: 'Toggle color theme',
      details: 'Details',
      copy: 'Copy',
      copied: 'Copied',
      illustrationAlt:
        'An illustration of the Golden Gate Bridge with the San Francisco skyline behind it and a sailboat on the bay.',
      illustrationCredit: 'Illustration redrawn with AI from a photo I took.'
    },
    role: 'Software Engineer',
    bio: {
      label: 'Bio',
      short: 'Default',
      long: 'Long',
      shortParagraphs: [
        "I'm a software engineer in the Bay Area. I build developer tooling, and I'm good at bringing AI agents into each stage of quality control: requirements, test design, code review and release.",
        "Most recently I was at TikTok, where I built a multi-agent code review system that runs in CI across 30+ repositories, and a pipeline that turns product requirements into test cases and automation scripts. Before that I built an internal data-quality platform at INFI.US in Chicago, and got my master's at Illinois Tech. I'm currently looking for software engineering roles.",
        'Outside of work I boulder, currently at V6, and take photos. Some of my photos are on [Unsplash](https://unsplash.com/@jincheng_1999).'
      ],
      longParagraphs: [
        "I'm a software engineer in the Bay Area. Most recently I was at TikTok, working on developer tools and agent infrastructure.",
        'Most of my work sits in two places: putting AI agents to use at each stage of quality control, from requirements and test design to code review and release, and building the tools that make a team faster.',
        'My main project at TikTok was a multi-agent code review system in CI. Each merge request gets several specialist reviewers running in parallel, and a coordinator merges their findings into one review and blocks the merge on critical issues. Most of the effort went into making it cheap and predictable enough to run on every merge request: a smaller shared context, fallbacks between models, timeouts, and tracking the cost of each review.',
        'I also built a pipeline that turns PRDs into test cases and then into automation scripts, and the CI release gates those scripts run in. Over the year, P0/P1 regression automation went from 80% to 96%.',
        'Before TikTok I spent six months at INFI.US in Chicago, where I built an internal data-quality platform on my own, from product design to deployment and operations. I finished my M.S. at Illinois Tech in 2024.',
        "I'm currently looking for software engineering roles. Outside of work I boulder (currently V6), take photos, some of which are on [Unsplash](https://unsplash.com/@jincheng_1999), and follow the markets."
      ]
    },
    projects: {
      title: 'Projects',
      status: { live: 'Live', wip: 'In progress', archived: 'Archived' },
      visit: 'Visit',
      source: 'Source',
      back: 'Back to home',
      preview: 'Preview of'
    },
    work: {
      title: 'Experience'
    },
    jobs: [
      {
        company: 'TikTok',
        role: 'Software Engineer in Test, Developer Tools & Agent Infrastructure',
        location: 'San Jose, CA',
        period: 'Jul 2025 – Sep 2026',
        summary:
          'Brought AI agents into code review and test design, and built the CI gates and developer tooling around them for 30+ repositories.',
        bullets: [
          'Built a multi-agent code review system that runs in CI on every merge request across 30+ internal repositories. A coordinator runs 7 specialist reviewers in parallel (security, performance, code quality, docs, release, internal standards), merges and de-duplicates their findings, and blocks the merge on critical issues. Review turnaround dropped by about 50%, and it has caught 100+ issues rated P2 or higher.',
          'Kept it cheap and reliable enough to run on every merge request: the number of reviewers and the model tier scale with diff size and sensitive paths, reviewers share one cached context instead of each getting a copy (token spend down 30%+), and each run has per-model fallbacks, timeouts, and input sanitization against prompt injection. Per-review token and cost tracking made it possible to compare models on quality, latency and cost.',
          'Built an AI pipeline that goes from PRD to test cases to automation scripts, raising test-case writing efficiency by 60% and cutting script development time by 70%.',
          'Wired backend API, integration and E2E suites for Trust & Safety products into CI/CD as release gates. P0/P1 regression automation went from 80.21% to 95.82%.',
          'Used production metrics and on-call trends to guide reliability work. Production issues dropped by 30%, and inspection stability went from 93.94% to 99.99%.',
          'Compared deployments across regions in app code, runtime config, middleware and third-party dependencies, found 19 region-specific scenarios and 60 config sets, and turned them into layered CI checks to catch config drift early.'
        ]
      },
      {
        company: 'INFI.US',
        role: 'Software Engineer in Test',
        location: 'Chicago, IL',
        period: 'Jan 2025 – Jun 2025',
        summary: 'Built an internal data-quality platform end to end, plus the E2E tests used for releases.',
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
        {
          name: 'AI agents',
          items: ['Multi-agent systems', 'Agent orchestration', 'MCP', 'LLM evaluation', 'Claude Code', 'Cursor']
        },
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
        '马锦程，湾区软件工程师，做研发效能工具，擅长把 AI Agent 用到需求、测试、代码评审和发布等质量环节。'
    },
    ui: {
      switchTo: 'EN',
      switchLabel: '切换到英文',
      theme: '切换深浅色',
      details: '展开',
      copy: '复制',
      copied: '已复制',
      illustrationAlt: '金门大桥插画，背后是旧金山的城市天际线，海湾上有一艘帆船。',
      illustrationCredit: '插画由我拍摄的照片经 AI 重绘而成。'
    },
    role: '软件工程师',
    bio: {
      label: '简介',
      short: '简短',
      long: '完整',
      shortParagraphs: [
        '我叫马锦程，在湾区做软件工程师。我擅长把 AI Agent 用到质量管控的各个环节，从需求、用例设计到代码评审和发布；也做研发效能工具。',
        '上一份工作在 TikTok，我做了一套在 CI 里运行的多 Agent 代码评审系统，接进了 30 多个内部仓库；还搭了一条从 PRD 生成测试用例、再生成自动化脚本的流水线。再往前，我在芝加哥的 INFI.US 独立做了内部数据质量平台，硕士是在伊利诺伊理工读的。现在正在找新的软件工程师工作。',
        '工作之外，我是个抱石爱好者，目前在爬 V6；也爱拍照，一些作品放在 [Unsplash](https://unsplash.com/@jincheng_1999) 上。'
      ],
      longParagraphs: [
        '我叫马锦程，在湾区做软件工程师。上一份工作在 TikTok，做研发工具和 Agent 基础设施。',
        '我的工作主要是两件事：一是把 AI Agent 用到研发流程的各个质量环节，比如需求、用例设计、代码评审和发布；二是做让团队效率更高的研发工具。',
        '在 TikTok 最主要的项目是 CI 里的多 Agent 代码评审系统。每个合并请求会同时跑几个不同方向的评审，由协调器汇总成一份结论，遇到严重问题直接拦下合并。最花时间的是让它便宜、稳定到每个合并请求都能跑：共享并压缩上下文、模型互为备份、设置超时，再把每次评审的成本算清楚。',
        '我还搭了一条从 PRD 生成测试用例、再生成自动化脚本的流水线，以及这些脚本所在的 CI 发布卡点。一年下来，P0/P1 回归自动化率从 80% 提到了 96%。',
        '来 TikTok 之前，我在芝加哥的 INFI.US 待了半年，一个人把内部数据质量平台从产品设计一路做到上线运维。2024 年从伊利诺伊理工硕士毕业。',
        '现在正在找新的软件工程师工作。平时是个抱石爱好者，目前在爬 V6；也爱拍照，一些作品放在 [Unsplash](https://unsplash.com/@jincheng_1999) 上；另外会关注股市。'
      ]
    },
    projects: {
      title: '项目',
      status: { live: '已上线', wip: '进行中', archived: '已归档' },
      visit: '访问',
      source: '源码',
      back: '返回首页',
      preview: '预览：'
    },
    work: {
      title: '工作经历'
    },
    jobs: [
      {
        company: 'TikTok',
        role: '测试开发工程师 · 研发工具与 Agent 基础设施',
        location: '美国加州 · 圣何塞',
        period: '2025.07 – 2026.09',
        summary:
          '把 AI Agent 用到代码评审和用例设计上，并搭建配套的 CI 卡点和研发工具，覆盖 30 多个仓库。',
        bullets: [
          '做了一套在 CI 里运行的多 Agent 代码评审系统，覆盖 30 多个内部仓库的全部合并请求。由一个协调器同时调起 7 个评审，分别看安全、性能、代码质量、文档、发布和内部规范，汇总去重后给出一份结论，遇到严重问题直接拦下合并。评审周期缩短约 50%，累计发现 100 多个 P2 及以上问题。',
          '让它便宜、稳定到每个合并请求都能跑：按 diff 大小和敏感路径决定开几个评审、用哪档模型；几个评审共用一份缓存好的上下文，不再各拷一份，Token 开销降了 30% 以上；每次运行都有按模型的降级链路、超时和防提示注入的输入过滤。再按任务统计 Token 和成本，用来比较不同模型的质量、延迟和花费。',
          '搭了一条 AI 用例生成流水线，从 PRD 到测试用例再到自动化脚本，用例编写效率提升 60%，脚本开发用时减少 70%。',
          '把信任与安全产品的后端接口、集成和 E2E 测试接入 CI/CD 发布卡点，P0/P1 回归自动化率从 80.21% 提升到 95.82%。',
          '依据线上指标和 On-call 趋势推动可靠性治理，线上问题减少 30%，巡检稳定性从 93.94% 提升到 99.99%。',
          '对比美国与非美国数据中心的部署差异，范围包括应用代码、运行时配置、中间件和第三方依赖。梳理出 19 类区域特有场景和 60 组配置，转成分层的 CI 校验，尽早发现跨区域的配置漂移。'
        ]
      },
      {
        company: 'INFI.US',
        role: '软件工程师',
        location: '美国伊利诺伊州 · 芝加哥',
        period: '2025.01 – 2025.06',
        summary: '一个人把内部数据质量平台从零做到上线，也负责发布前的 E2E 测试。',
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
        {
          name: 'AI Agent',
          items: ['多 Agent 系统', 'Agent 编排', 'MCP', 'LLM 评测', 'Claude Code', 'Cursor']
        },
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
