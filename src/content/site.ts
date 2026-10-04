// The site's copy: the profile, bio, experience and the few words the
// project pages use. The desktop gets it through OSData (src/pages/index.astro).
export const profile = {
  name: 'Jincheng Ma',
  // Their name in Chinese, for search engines (schema.org alternateName).
  alternateName: '马锦程',
  handle: 'jma49',
  email: 'majincheng990128@gmail.com',
  github: 'https://github.com/jma49',
  linkedin: 'https://www.linkedin.com/in/jincheng-ma-professional',
  photography: 'https://unsplash.com/@jincheng_1999',
  location: 'San Jose, California'
};

// Bio paragraphs support inline links written as [text](url).
export const content = {
  meta: {
    title: 'Jincheng Ma — Software Engineer',
    description:
      'Jincheng Ma is a software engineer in the Bay Area who builds developer tooling and brings AI agents into code review, testing and release.'
  },
  ui: {
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
    resume: 'Résumé',
    resumeHref: '/?open=resume',
    photography: 'Photography'
  },
  footer: {
    source: 'Source'
  }
} as const;
