import { fmtGram, fmtStars, type OrderMethod } from '../api';
import { GramIcon } from './GramIcon';
import { StarIcon } from './StarIcon';

/** A price in either currency: the number, then its mark. Never a ticker. */
export function Amount({ method, gram, stars, size = 16 }: { method: OrderMethod; gram?: number | null; stars?: number | null; size?: number }) {
  return method === 'stars'
    ? <>{fmtStars(stars ?? 0)}<StarIcon size={size} /></>
    : <>{fmtGram(gram ?? 0)}<GramIcon size={size} /></>;
}
