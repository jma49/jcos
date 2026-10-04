import { JOB_STAGES, type JobKind, type JobOutcome, type JobStage } from '../../social/jobs';
import { allOf, hueOf, type JobTotals } from './jobs';

// The small pieces Job Hunt's views share: names, a company's monogram,
// iTunes' capacity bar by stage, and how far they got.

export const STAGE_NAMES: Record<JobStage, string> = {
  applied: 'Applied',
  assessment: 'Assessment',
  interviewing: 'Interviewing',
  offer: 'Offer',
  closed: 'Closed'
};

export const OUTCOME_NAMES: Record<JobOutcome, string> = {
  rejected: 'Rejected',
  withdrew: 'Withdrew',
  no_reply: 'No reply',
  declined: 'Declined'
};

export const KIND_NAMES: Record<JobKind, string> = {
  applied: 'Applied',
  assessment: 'Assessment',
  interview: 'Interview',
  offer: 'Offer',
  rejection: 'Rejected',
  withdrawal: 'Withdrew',
  reminder: 'Reminder',
  other: 'From them'
};

/** The stage colour a message's kind wears. */
export const KIND_STAGES: Record<JobKind, JobStage> = {
  applied: 'applied',
  assessment: 'assessment',
  interview: 'interviewing',
  offer: 'offer',
  rejection: 'closed',
  withdrawal: 'closed',
  reminder: 'assessment',
  other: 'applied'
};

/** A Gmail thread's address, to open it there. */
export const gmailLink = (thread: string) => `https://mail.google.com/mail/u/0/#all/${thread}`;

/** A company's first letter on a gel, in a colour of its own. */
export function Monogram({ company, size = 18 }: { company: string; size?: number }) {
  return (
    <span
      className="os-jh-mono"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55), '--hue': hueOf(company) } as React.CSSProperties}
      aria-hidden="true"
    >
      {company.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/** iTunes' capacity bar, by stage, with its legend. */
export function Capacity({ totals }: { totals: JobTotals }) {
  const all = allOf(totals);
  return (
    <div className="os-jh-capacity">
      <div className="os-jh-bar" role="img" aria-label={JOB_STAGES.map((s) => `${STAGE_NAMES[s]} ${totals.stages[s]}`).join(', ')}>
        {all > 0 && JOB_STAGES.map((s) => totals.stages[s] > 0 && <span key={s} data-stage={s} style={{ flex: totals.stages[s] }} />)}
      </div>
      <div className="os-jh-legend" aria-hidden="true">
        {JOB_STAGES.map((s) => (
          <span key={s} data-stage={s}>
            <i />
            {STAGE_NAMES[s]} {totals.stages[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** How far they got: every application, then how many reached an assessment, interviews and an offer. */
export function Funnel({ totals }: { totals: JobTotals }) {
  const all = allOf(totals);
  const rows: [JobStage, string, number][] = [
    ['applied', 'Applied', all],
    ['assessment', 'Assessment', totals.reached.assessment],
    ['interviewing', 'Interviews', totals.reached.interviewing],
    ['offer', 'Offer', totals.reached.offer]
  ];
  return (
    <div className="os-jh-funnel">
      <p>How far they got</p>
      {rows.map(([stage, name, n]) => (
        <div key={stage} data-stage={stage}>
          <span>{name}</span>
          <i style={{ width: `${all ? Math.max(n ? 4 : 0, (n / all) * 100) : 0}%` }} />
          <b>{n}</b>
        </div>
      ))}
    </div>
  );
}
