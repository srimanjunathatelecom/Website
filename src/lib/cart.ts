export type CartItem = {
  productId: number;
  slug: string;
  name: string;
  brand: string;
  mrp: number;
  mop: number;
  image: string;
  stock: number;
  qty: number;
  /**
   * The specific colour/RAM/storage row this line refers to, or null for a
   * product with no variants. Two different variants of the same phone are
   * separate cart lines — previously the cart deduplicated on productId
   * alone, so adding "128 GB Black" after "256 GB Blue" silently merged them
   * into one line at the first variant's price.
   */
  variantId?: number | null;
  /** e.g. "8 GB / 256 GB · Titanium Blue" — shown in the cart and checkout. */
  variantLabel?: string;
  sku?: string;
};

const KEY = "sms_cart";

/**
 * Stable identity for a cart line: product + variant. `null`/`undefined`
 * variantId both collapse to the same "no variant" key so items added before
 * variant tracking existed keep behaving as one line.
 */
export function cartLineKey(item: Pick<CartItem, "productId" | "variantId">) {
  return `${item.productId}:${item.variantId ?? 0}`;
}

export function getCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Guard against a corrupted or hand-edited localStorage value: the cart
    // is read on nearly every page, so a malformed entry here would
    // otherwise throw during render.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((i) => i && typeof i.productId === "number") as CartItem[];
  } catch {
    return [];
  }
}

function persist(items: CartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("sms-cart-change"));
}

export function addToCart(item: Omit<CartItem, "qty">, qty = 1) {
  const items = getCart();
  const key = cartLineKey(item);
  const existing = items.find((i) => cartLineKey(i) === key);
  const cap = Math.max(1, item.stock);
  if (existing) {
    // Keep the newest price/stock/image snapshot — the shopper may have added
    // this item days ago and the admin may have changed it since.
    existing.mrp = item.mrp;
    existing.mop = item.mop;
    existing.stock = item.stock;
    existing.image = item.image;
    existing.name = item.name;
    existing.variantLabel = item.variantLabel;
    existing.sku = item.sku;
    existing.qty = Math.min(existing.qty + qty, cap);
  } else {
    items.push({ ...item, variantId: item.variantId ?? null, qty: Math.min(qty, cap) });
  }
  persist(items);
}

export function updateQty(productId: number, qty: number, variantId?: number | null) {
  const key = cartLineKey({ productId, variantId });
  const items = getCart().map((i) =>
    cartLineKey(i) === key ? { ...i, qty: Math.max(1, Math.min(qty, Math.max(1, i.stock))) } : i
  );
  persist(items);
}

export function removeFromCart(productId: number, variantId?: number | null) {
  const key = cartLineKey({ productId, variantId });
  persist(getCart().filter((i) => cartLineKey(i) !== key));
}

export function clearCart() {
  persist([]);
}

/**
 * Overwrite the cart wholesale.
 *
 * Used by checkout after it re-prices the cart against the server: prices and
 * stock in here are a snapshot from add-to-cart time, so once the real figures
 * come back the stale ones have to be replaced rather than patched line by line
 * (items may also have been dropped). Goes through `persist`, so the header
 * count and any other listener update with it.
 */
export function replaceCart(items: CartItem[]) {
  persist(items);
}

export function cartCount(): number {
  return getCart().reduce((s, i) => s + i.qty, 0);
}

export function cartTotals(items: CartItem[]) {
  const totalMrp = items.reduce((s, i) => s + i.mrp * i.qty, 0);
  const totalMop = items.reduce((s, i) => s + i.mop * i.qty, 0);
  return { totalMrp, totalMop, savings: totalMrp - totalMop };
}
