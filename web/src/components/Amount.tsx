import { fmtGram } from '../api';
import { GramIcon } from './GramIcon';

/** A GRAM amount with the gem after it. */
export function Amount({ gram, size = 16 }: { gram?: number | null; size?: number }) {
  return <>{fmtGram(gram ?? 0)}<GramIcon size={size} /></>;
}
