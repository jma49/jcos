import { useOSData } from '../context';
import { launch } from '../registry';

export default function Resume() {
  const data = useOSData();

  return (
    <div className="os-app">
      <div className="os-toolbar">
        <button
          type="button"
          className="os-button"
          onClick={() => launch('pdf', { title: 'Résumé.pdf', props: { src: data.links.resume } })}
        >
          Open PDF
        </button>
        <a className="os-button" href={data.links.resume} download>
          Download
        </a>
        <span className="os-toolbar-meta">{data.email}</span>
      </div>

      <div className="os-scroll os-resume">
        <header>
          <h1>{data.name}</h1>
          <p>
            {data.role} · {data.location}
          </p>
        </header>

        <section>
          <h2>Experience</h2>
          {data.jobs.map((job) => (
            <details key={job.company + job.period}>
              <summary>
                <span className="os-resume-head">
                  <strong>{job.company}</strong>
                  <span>{job.role}</span>
                </span>
                <span className="os-resume-period">{job.period}</span>
              </summary>
              <p className="os-resume-summary">{job.summary}</p>
              <ul>
                {job.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </details>
          ))}
        </section>

        <section>
          <h2>Skills</h2>
          <dl className="os-resume-skills">
            {data.skills.map((g) => (
              <div key={g.name}>
                <dt>{g.name}</dt>
                <dd>{g.items.join(', ')}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2>Education</h2>
          {data.education.map((e) => (
            <div key={e.school} className="os-resume-edu">
              <span className="os-resume-head">
                <strong>{e.school}</strong>
                <span>{e.degree}</span>
              </span>
              <span className="os-resume-period">{e.period}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
