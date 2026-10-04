import { useEffect, useRef, useState } from 'react';
import { newPlaylistName, onTheGo, saveOnTheGo, type Playlist } from '../../media/playlists';
import { playlistNameProblem, PLAYLIST_NAME_MAX } from '../../social/playlistNames';
import type { ScreenInput } from './input';

// Saving On-The-Go as one of Jincheng's playlists, for everyone: the
// iPod names it "New Playlist 1" as a real one would, and here it can be
// renamed first. The name of a playlist that's there adds the songs to it.
// Return or the centre button saves; Escape or MENU goes back.

export function SavePlaylist({
  input,
  onSaved,
  onCancel
}: {
  input: (handle: ScreenInput | null) => void;
  onSaved: (playlist: Playlist) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(newPlaylistName);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const count = onTheGo().length;

  // Set at once, so a second press before the screen shows "Saving…" doesn't save twice.
  const busy = useRef(false);
  const save = async () => {
    if (busy.current) return;
    const wrong = playlistNameProblem(name);
    if (wrong) return setProblem(wrong);
    busy.current = true;
    setSaving(true);
    setProblem(null);
    try {
      onSaved(await saveOnTheGo(name));
    } catch (error) {
      busy.current = false;
      setSaving(false);
      setProblem(error instanceof Error ? error.message : 'It couldn’t be saved. Try again.');
    }
  };

  // The centre button saves (the latest name); the wheel has nothing to move here.
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => {
    input({ step: () => {}, choose: () => void latest.current() });
    field.current?.focus();
    field.current?.select();
    return () => input(null);
  }, [input]);

  return (
    <form
      className="os-ipod-save"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor="os-ipod-save-name">Name</label>
      <input
        id="os-ipod-save-name"
        ref={field}
        value={name}
        maxLength={PLAYLIST_NAME_MAX}
        spellCheck={false}
        autoComplete="off"
        disabled={saving}
        onChange={(e) => {
          setName(e.target.value);
          setProblem(null);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          onCancel();
        }}
      />
      <p role={problem ? 'alert' : undefined} data-problem={problem ? true : undefined}>
        {problem ?? (saving ? 'Saving…' : `${count} ${count === 1 ? 'song' : 'songs'}, for everyone to see. A playlist’s name adds them to it.`)}
      </p>
    </form>
  );
}
