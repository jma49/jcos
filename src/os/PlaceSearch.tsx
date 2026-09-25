import { useEffect, useRef, useState } from 'react';
import { placeLabel, searchPlaces, type Place } from './place';

/** A city search box with a list of matches; used by the Weather widget and System Preferences. */
export function PlaceSearch({ id, onPick, onCancel }: { id: string; onPick: (place: Place) => void; onCancel?: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | 'error' | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => field.current?.focus(), []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(query, abort.signal).then(setResults, (e) => e.name !== 'AbortError' && setResults('error'));
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query]);

  return (
    <div className="os-place-search">
      <input
        id={id}
        ref={field}
        type="search"
        placeholder="City"
        value={query}
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && onCancel) {
            e.stopPropagation();
            onCancel();
          }
          if (e.key === 'Enter' && Array.isArray(results) && results[0]) onPick(results[0]);
        }}
      />
      <ul>
        {results === 'error' && <li className="os-place-note">Search unavailable</li>}
        {Array.isArray(results) && results.length === 0 && <li className="os-place-note">No matches</li>}
        {Array.isArray(results) &&
          results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}>
              <button type="button" onClick={() => onPick(r)}>
                {placeLabel(r)}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
