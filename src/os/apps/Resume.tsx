import { useState } from 'react';
import { useOSData } from '../core/context';
import { plain } from './inline';

const ZOOMS = [0.75, 0.9, 1, 1.15, 1.3];

/** The résumé as a Pages-style document: a white page on a grey canvas. */
export default function Resume() {
  const data = useOSData();
  const [zoom, setZoom] = useState(2);
  // Short forms that fit the sidebar: github.com/jma49, in/jincheng-ma-professional.
  const handle = (url: string) =>
    url
      .replace(/^https?:\/\/(www\.)?/, '')
      .replace(/^linkedin\.com\//, '')
      .replace(/\/$/, '');

  return (
    <div className="os-app os-pages">
      <div className="os-toolbar">
        <div className="os-segmented" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" disabled={zoom === 0} onClick={() => setZoom((z) => z - 1)}>
            −
          </button>
          <button type="button" aria-label="Actual size" onClick={() => setZoom(2)}>
            {Math.round(ZOOMS[zoom] * 100)}%
          </button>
          <button type="button" aria-label="Zoom in" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => z + 1)}>
            +
          </button>
        </div>
        <button type="button" className="os-button" onClick={() => window.print()}>
          Print…
        </button>
        <span className="os-toolbar-meta">Résumé — {data.name}</span>
      </div>

      <div className="os-scroll os-pages-canvas">
        <article className="os-page" style={{ zoom: ZOOMS[zoom] }}>
          <header className="os-cv-header">
            <h1>{data.name}</h1>
            <p className="os-cv-role">{data.role}</p>
            <p className="os-cv-where">{data.location}</p>
          </header>

          <div className="os-cv-body">
            <aside className="os-cv-side">
              <section>
                <h2>Contact</h2>
                <ul className="os-cv-contact">
                  <li>
                    <a href={`mailto:${data.email}`}>{data.email}</a>
                  </li>
                  <li>
                    <a href={data.links.github} target="_blank" rel="noopener">
                      {handle(data.links.github)}
                    </a>
                  </li>
                  <li>
                    <a href={data.links.linkedin} target="_blank" rel="noopener">
                      {handle(data.links.linkedin)}
                    </a>
                  </li>
                </ul>
              </section>

              <section>
                <h2>Skills</h2>
                {data.skills.map((g) => (
                  <div key={g.name} className="os-cv-skill">
                    <h3>{g.name}</h3>
                    <p>{g.items.join(' · ')}</p>
                  </div>
                ))}
              </section>

              <section>
                <h2>Education</h2>
                {data.education.map((e) => (
                  <div key={e.school} className="os-cv-edu">
                    <h3>{e.school}</h3>
                    <p>{e.degree}</p>
                    <p className="os-cv-date">{e.period}</p>
                  </div>
                ))}
              </section>
            </aside>

            <main className="os-cv-main">
              <section>
                <h2>Profile</h2>
                <p className="os-cv-profile">{plain(data.bio.short[0])}</p>
              </section>

              <section>
                <h2>Experience</h2>
                {data.jobs.map((job) => (
                  <div key={job.company + job.period} className="os-cv-job">
                    <div className="os-cv-job-head">
                      <h3>{job.company}</h3>
                      <span className="os-cv-date">{job.period}</span>
                    </div>
                    <p className="os-cv-job-role">{job.role}</p>
                    <p className="os-cv-job-summary">{job.summary}</p>
                    <ul>
                      {job.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            </main>
          </div>
        </article>
      </div>
    </div>
  );
}
