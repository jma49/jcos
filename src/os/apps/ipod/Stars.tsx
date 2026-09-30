// A rating as the iPod shows it on Now Playing: a star for each one given,
// and a dot for each not, five in all.

const Star = () => (
  <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M8 1.2l1.95 4.3 4.7.5-3.5 3.18 1 4.62L8 11.45 3.85 13.8l1-4.62L1.35 6l4.7-.5z" />
  </svg>
);

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="os-ipod-stars">
      {[1, 2, 3, 4, 5].map((n) => (n <= rating ? <Star key={n} /> : <i key={n} />))}
    </span>
  );
}

/** How a rating reads aloud. */
export const ratingLabel = (rating: number) => (rating ? `${rating} ${rating === 1 ? 'star' : 'stars'}` : 'Not rated');
