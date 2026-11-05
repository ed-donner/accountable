import type { SearchGroup } from "../components/Search";
import { price } from "../lib/money";

type ProductResult = { id: number; name: string; unit_price_cents: number };

const products: SearchGroup<ProductResult> = {
  kind: "products",
  heading: "Products",
  address: (id) => `/products/${id}`,
  detail: (result) => <span className="num">{price(result.unit_price_cents)}</span>,
};

/** What the top bar's search shows of the price list: active products, with their prices (K4, K5). */
export const productsSearchGroups: SearchGroup[] = [products];
