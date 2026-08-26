/**
 * Raven Scents sample-merchant profile (local dev storefront, http://localhost:5173).
 *
 * This is PURE CONFIGURATION — every piece of automation logic that used to be
 * hard-coded for this merchant in `shopping-agent.ts` now lives generically in
 * `src/local-merchant.ts`, parameterized by the {@link LocalMerchantProfile}
 * below. Importing this module registers the profile so `store: "raven"`
 * resolves to it.
 *
 * The search box lives on /shop (client-side filtering), so `shopPath` points
 * there — the agent drives the *visual* catalog instead of a URL query param.
 */
import { registerLocalMerchant, type LocalMerchantProfile } from "../local-merchant";

export const RAVEN_SCENTS_PROFILE: LocalMerchantProfile = {
  key: "raven",
  name: "Raven Scents",
  baseUrl: "http://localhost:5173",
  shopPath: "/shop",
  cartPath: "/cart",
  loginPath: "/login",
  productHrefPrefix: "/product/",
  currency: "INR",
  currencySymbol: "₹",

  // JS evaluated in the page: total item count from the persisted cart state.
  persistedCartCountExpr: `
    (() => {
      try {
        const raw = localStorage.getItem('raven-cart');
        const state = raw ? JSON.parse(raw)?.state : null;
        return (state?.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      } catch { return 0; }
    })()
  `,

  // Raven's shipping rule: free above ₹5,000 subtotal, else ₹299 flat.
  shippingRule: (subtotalMajor) => (subtotalMajor >= 5000 ? 0 : 299),

  // Raven's form labels are visual-only (inputs have no name/for attributes),
  // so its seven inputs are filled by stable DOM order.
  checkoutForm: {
    positionalValues: [
      "Test", // first name
      "Buyer", // last name
      "test@example.com", // email
      "9999999999", // phone
      "123 Test Street", // address
      "Mumbai", // city
      "400001", // pincode
    ],
    requiredSelect: { selector: "select", value: "Maharashtra" },
  },

  // Test account credentials come from the environment (never hardcoded).
  account: {
    emailEnv: "MERCHANT_ACCOUNT_EMAIL",
    passwordEnv: "MERCHANT_ACCOUNT_PASSWORD",
    fullNameEnv: "MERCHANT_ACCOUNT_NAME",
  },

  // Perfume-store vocabulary ignored during basket-item fuzzy matching.
  basketStopTokens: [
    "perfume", "cologne", "fragrance", "scent", "mist", "eau", "de", "parfum",
  ],
};

registerLocalMerchant(RAVEN_SCENTS_PROFILE);
