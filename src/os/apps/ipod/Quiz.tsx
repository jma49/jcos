import { useCallback, useEffect, useRef, useState } from 'react';
import { SONGS, useMusic } from '../../media/music';
import { play } from '../../core/sound';
import type { ScreenInput } from './input';

// Music Quiz: a few seconds of a song from the library, four titles, one
// right. Five rounds. The wheel picks, the centre answers.

const ROUNDS = 5;
const SECONDS = 15;
/** Where in the song the snippet starts, past most intros. */
const FROM = 40;

interface Round {
  answer: number;
  options: number[];
}

function shuffled<T>(list: T[]) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Five songs to guess, each with three other titles to choose from. */
function newGame(): Round[] {
  const all = SONGS.map((_, i) => i);
  return shuffled(all)
    .slice(0, ROUNDS)
    .map((answer) => ({
      answer,
      options: shuffled([answer, ...shuffled(all.filter((i) => i !== answer)).slice(0, 3)])
    }));
}

export function Quiz({ input }: { input: (handle: ScreenInput | null) => void }) {
  const [game, setGame] = useState(newGame);
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(SECONDS);
  const done = round >= ROUNDS;
  const current = game[Math.min(round, ROUNDS - 1)];
  const answered = useRef(false);

  // Each round: play the snippet and start the clock.
  useEffect(() => {
    if (done) return;
    const music = useMusic.getState();
    music.play('ipod', current.answer, [current.answer]);
    useMusic.setState({ resume: { index: current.answer, time: FROM } });
    answered.current = false;
    setRevealed(false);
    setPicked(0);
    setLeft(SECONDS);
  }, [round, game, done, current.answer]);

  const reveal = useCallback(
    (choice: number | null) => {
      if (answered.current) return;
      answered.current = true;
      setRevealed(true);
      useMusic.getState().pause();
      const right = choice !== null && current.options[choice] === current.answer;
      if (right) setScore((s) => s + 1);
      play(right ? 'chime' : 'error');
    },
    [current]
  );

  useEffect(() => {
    if (done || revealed) return;
    if (left <= 0) return reveal(null);
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left, done, revealed, reveal]);

  // Leaving the quiz stops the snippet.
  useEffect(() => () => useMusic.getState().pause(), []);

  useEffect(() => {
    input({
      step: (delta) => !revealed && !done && setPicked((p) => Math.min(3, Math.max(0, p + delta))),
      choose: () => {
        if (done) {
          setGame(newGame());
          setRound(0);
          setScore(0);
        } else if (!revealed) {
          reveal(picked);
        } else {
          setRound((r) => r + 1);
        }
      },
      // The music buttons would give the answer away.
      press: () => true
    });
    return () => input(null);
  }, [input, revealed, done, picked, reveal]);

  if (done) {
    return (
      <div className="os-quiz os-quiz-done">
        <strong>
          {score} / {ROUNDS}
        </strong>
        <span>{score === ROUNDS ? 'Perfect ear.' : score >= 3 ? 'Nicely done.' : 'Keep listening.'}</span>
        <small>Centre button to play again</small>
      </div>
    );
  }

  return (
    <div className="os-quiz">
      <p className="os-quiz-head">
        <span>
          Round {round + 1} of {ROUNDS}
        </span>
        <span>{revealed ? `${score} right` : `${left}s`}</span>
      </p>
      <div className="os-quiz-timer">
        <span style={{ width: `${(left / SECONDS) * 100}%` }} />
      </div>
      <ul>
        {current.options.map((i, n) => {
          const state = revealed ? (i === current.answer ? 'right' : n === picked ? 'wrong' : undefined) : undefined;
          return (
            <li key={i} aria-selected={!revealed && n === picked} data-state={state}>
              <strong>{SONGS[i].title}</strong>
              <small>{SONGS[i].artist}</small>
            </li>
          );
        })}
      </ul>
      {revealed && <p className="os-quiz-next">Centre button for the next song</p>}
    </div>
  );
}
