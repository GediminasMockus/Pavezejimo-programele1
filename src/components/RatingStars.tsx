import { Star } from 'lucide-react';

export function RatingStars({
  score,
  size = 'md',
  showNumber = false,
}: {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showNumber?: boolean;
}) {
  const sizes = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-6 h-6' };
  const starSize = sizes[size];

  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${starSize} ${
            n <= Math.round(score)
              ? 'text-amber-400 fill-amber-400'
              : 'text-slate-200 fill-slate-200'
          }`}
        />
      ))}
      {showNumber && (
        <span className="ml-1 text-sm font-semibold text-slate-600">
          {score.toFixed(1)}
        </span>
      )}
    </span>
  );
}

export function StarPicker({
  value,
  onChange,
  size = 'lg',
}: {
  value: number;
  onChange: (score: number) => void;
  size?: 'md' | 'lg';
}) {
  const sizes = { md: 'w-6 h-6', lg: 'w-8 h-8' };
  const starSize = sizes[size];

  return (
    <span className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="transition-transform hover:scale-110 active:scale-95"
        >
          <Star
            className={`${starSize} ${
              n <= value
                ? 'text-amber-400 fill-amber-400'
                : 'text-slate-300 fill-slate-100'
            }`}
          />
        </button>
      ))}
    </span>
  );
}
