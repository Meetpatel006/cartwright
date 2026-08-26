import { describe, expect, test } from "bun:test";

import { parseBudget, stripBudgetClause } from "./budget";

describe("stripBudgetClause", () => {
  test("strips 'under $100' from the end of a query", () => {
    expect(stripBudgetClause("wireless headphones under $100")).toBe("wireless headphones");
  });

  test("strips INR variants ('under 5000', 'below Rs. 3,000')", () => {
    expect(stripBudgetClause("gardenia under 5000")).toBe("gardenia");
    expect(stripBudgetClause("perfume below Rs. 3,000")).toBe("perfume");
    expect(stripBudgetClause("running shoes under 10k")).toBe("running shoes");
  });

  test("strips other comparison words (less than, upto, max)", () => {
    expect(stripBudgetClause("smartwatch less than ₹20000")).toBe("smartwatch");
    expect(stripBudgetClause("air fryer upto $150")).toBe("air fryer");
    expect(stripBudgetClause("monitor max 300 usd")).toBe("monitor");
  });

  test("strips currency words after the amount ('under 100 dollars')", () => {
    expect(stripBudgetClause("wireless headphones under 100 dollars")).toBe("wireless headphones");
    expect(stripBudgetClause("smartwatch below 20000 rupees")).toBe("smartwatch");
  });

  test("leaves queries without a budget clause unchanged", () => {
    expect(stripBudgetClause("dark ocean perfume")).toBe("dark ocean perfume");
    expect(stripBudgetClause("under armour shoes")).toBe("under armour shoes");
  });
});

describe("parseBudget (regression)", () => {
  test("still parses the clauses that stripBudgetClause removes", () => {
    expect(parseBudget("wireless headphones under $100")?.amountInMinor).toBe(10_000);
    expect(parseBudget("gardenia under 5000", "INR")?.currency).toBe("INR");
  });

  test("'dollars' is detected as USD, not INR (the old /rs.?/ hint matched inside 'dollaRS')", () => {
    const parsed = parseBudget("wireless headphones under 100 dollars");
    expect(parsed?.currency).toBe("USD");
    expect(parsed?.amountInMinor).toBe(10_000);
  });
});
