/**
 * Occupancy type for LiteAPI: one room = adults + array of child ages (integers).
 * API format: { adults: number, children?: number[] }
 */
export interface Occupancy {
  adults: number;
  children: number[]; // ages in years
}

export const MIN_ROOMS = 1;
export const MAX_ROOMS = 5;
export const MIN_ADULTS_PER_ROOM = 1;
export const MAX_ADULTS_PER_ROOM = 6;
export const MAX_CHILDREN_PER_ROOM = 4;
export const CHILD_AGE_MIN = 0;
export const CHILD_AGE_MAX = 17;

/** Default: 1 room, 2 adults, no children */
export const DEFAULT_OCCUPANCIES: Occupancy[] = [{ adults: 2, children: [] }];

/**
 * Parse occupancies from URL param.
 * Format: "2,5,2|1" = room1: 2 adults + children 5,2; room2: 1 adult.
 * Backward compat: "2" or missing → 1 room, 2 adults.
 */
export function parseOccupanciesParam(value: string | null): Occupancy[] {
  if (!value || value.trim() === "") return DEFAULT_OCCUPANCIES;
  const parts = value.split("|").filter(Boolean);
  if (parts.length === 0) return DEFAULT_OCCUPANCIES;
  const occupancies: Occupancy[] = [];
  for (const part of parts) {
    const nums = part.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
    if (nums.length === 0) continue;
    const adults = Math.max(MIN_ADULTS_PER_ROOM, Math.min(MAX_ADULTS_PER_ROOM, nums[0]));
    const children = nums.slice(1).map((a) => Math.max(CHILD_AGE_MIN, Math.min(CHILD_AGE_MAX, a)));
    occupancies.push({ adults, children });
  }
  if (occupancies.length === 0) return DEFAULT_OCCUPANCIES;
  return occupancies.slice(0, MAX_ROOMS);
}

/**
 * Serialize occupancies for URL.
 * Format: "adults[,age1,age2,...]|adults|..." (no trailing pipe)
 */
export function serializeOccupancies(occupancies: Occupancy[]): string {
  return occupancies
    .slice(0, MAX_ROOMS)
    .map((o) => {
      const parts = [String(o.adults)];
      if (o.children.length) parts.push(...o.children.map(String));
      return parts.join(",");
    })
    .join("|");
}

export function totalAdults(occupancies: Occupancy[]): number {
  return occupancies.reduce((sum, o) => sum + o.adults, 0);
}

export function totalChildren(occupancies: Occupancy[]): number {
  return occupancies.reduce((sum, o) => sum + o.children.length, 0);
}

export function totalGuests(occupancies: Occupancy[]): number {
  return totalAdults(occupancies) + totalChildren(occupancies);
}

/** Build API occupancies: each room { adults, children } (children = array of ages) */
export function toApiOccupancies(occupancies: Occupancy[]): { adults: number; children?: number[] }[] {
  return occupancies.map((o) => ({
    adults: o.adults,
    ...(o.children.length > 0 ? { children: o.children } : {})
  }));
}

/** Number of nights between check-in and check-out (yyyy-mm-dd). */
export function getNights(checkin: string, checkout: string): number {
  if (!checkin || !checkout) return 0;
  const a = new Date(checkin);
  const b = new Date(checkout);
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}
