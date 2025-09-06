import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
	return twMerge(clsx(inputs));
}
// add or export with your other utils
export function availabilityColor(code) {
	switch ((code || '').toUpperCase()) {
	  case 'IN_STOCK':     return 'text-green-400';
	  case 'LOW_STOCK':    return 'text-red-400';       // make this red
	  case 'SHIP_DELAY':   return 'text-yellow-400';
	  case 'OTHER_SELLERS':return 'text-blue-400';
	  case 'POD':          return 'text-emerald-400';
	  case 'OOS':          return 'text-red-500';
	  case 'UNAVAILABLE':  return 'text-zinc-400';
	  default:             return 'text-zinc-300';
	}
  }
  