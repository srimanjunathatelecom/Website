export type CompareItem = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  mrp: string | number;
  mop: string | number;
  primaryImage?: string | null;
  stock: number;
  lowStockThreshold: number;
};

const KEY = "sms_compare";

export function getCompare(): CompareItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CompareItem[]) : [];
  } catch {
    return [];
  }
}

function persist(items: CompareItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("sms-compare-change"));
}

export function toggleCompare(item: CompareItem) {
  let items = getCompare();
  if (items.some((i) => i.id === item.id)) {
    items = items.filter((i) => i.id !== item.id);
  } else {
    if (items.length >= 2) {
      alert("You can only compare 2 items at a time. Please remove one first.");
      return;
    }
    items.push(item);
  }
  persist(items);
}

export function removeFromCompare(id: number) {
  persist(getCompare().filter((i) => i.id !== id));
}

export function clearCompare() {
  persist([]);
}

export function compareCount(): number {
  return getCompare().length;
}