// The music in this browser: the snapshot is all the library there is, no
// bot plays anything for everyone, and Jincheng's ratings, plays and
// playlists are kept here, written only by the member named DEV_OWNER.

import { loadJSON, saveJSON } from '../../core/storage';
import { SocialError } from '../errors';
import type { Listening, MusicSocial } from '../music';
import { playlistNameProblem } from '../playlistNames';
import type { LocalContext } from './context';

const LISTENING_KEY = 'os-dev-listening';

export function localMusic({ owner }: LocalContext): MusicSocial {
  const listening = () => loadJSON<Listening>(LISTENING_KEY, { stats: {}, playlists: [] });
  /** Changes the stored listening from what's stored now, as another tab may have changed it. */
  const changeListening = (change: (l: Listening) => void) => {
    const l = listening();
    change(l);
    saveJSON(LISTENING_KEY, l);
  };

  return {
    // The snapshot is all the library there is here.
    async song() {
      return null;
    },
    // Only the bot plays songs for everyone, and there's no bot here.
    async nowPlaying() {
      return null;
    },
    watchNowPlaying() {
      return () => {};
    },

    async listening() {
      return listening();
    },
    async rateSong(id, rating) {
      owner('the ratings everyone sees');
      if (!Number.isInteger(rating) || rating < 0 || rating > 5) throw new SocialError('failed', 'A rating is one to five stars.');
      changeListening((l) => {
        const { rating: _, ...rest } = l.stats[id] ?? { plays: 0 };
        l.stats[id] = rating ? { ...rest, rating } : rest;
      });
    },
    async songPlayed(id) {
      owner('the play counts everyone sees');
      changeListening((l) => {
        const was = l.stats[id] ?? { plays: 0 };
        l.stats[id] = { ...was, plays: was.plays + 1, played: new Date().toISOString() };
      });
    },
    async savePlaylist(name, songs) {
      owner('the playlists everyone sees');
      const problem = playlistNameProblem(name);
      if (problem) throw new SocialError('invalid', problem);
      let id = 0;
      changeListening((l) => {
        const named = l.playlists.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
        const list = named ?? { id: Math.max(0, ...l.playlists.map((p) => p.id)) + 1, name: name.trim(), songs: [] };
        list.songs = [...new Set([...list.songs, ...songs])];
        if (!named) l.playlists.push(list);
        id = list.id;
      });
      return id;
    },
    async unlistSong(playlist, song) {
      owner('the playlists everyone sees');
      changeListening((l) => {
        const list = l.playlists.find((p) => p.id === playlist);
        if (list) list.songs = list.songs.filter((s) => s !== song);
      });
    },
    async deletePlaylist(playlist) {
      owner('the playlists everyone sees');
      changeListening((l) => {
        l.playlists = l.playlists.filter((p) => p.id !== playlist);
      });
    }
  };
}
