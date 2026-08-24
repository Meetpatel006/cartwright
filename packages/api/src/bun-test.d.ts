/**
 * Ambient type declaration for Bun's test module so that `tsc --noEmit` can
 * type-check production source without pulling in a separate `@types` package.
 * Runtime tests still execute under `bun test` (which provides its own types);
 * this declaration only satisfies the standalone TypeScript compiler.
 */
declare module "bun:test" {
  type TestFn = (...args: unknown[]) => void | Promise<void>;
  // `any[]` (not `unknown[]`) so parameterized test callbacks may narrow their
  // own argument types when used via `test.each`.
  type EachResult = (
    name: string,
    fn: (...args: any[]) => void | Promise<void>,
  ) => void;

  export function describe(name: string, fn: TestFn): void;
  export function test(name: string, fn: TestFn): void;
  export function it(name: string, fn: TestFn): void;
  export function beforeAll(fn: TestFn): void;
  export function afterAll(fn: TestFn): void;
  export function beforeEach(fn: TestFn): void;
  export function afterEach(fn: TestFn): void;

  export namespace describe {
    function each(table: ReadonlyArray<unknown>): EachResult;
  }
  export namespace test {
    function each(table: ReadonlyArray<unknown>): EachResult;
  }
  export namespace it {
    function each(table: ReadonlyArray<unknown>): EachResult;
  }

  // Matchers are intentionally permissive here; behavioral assertions live in code.
  export function expect<T>(value: T): any;
  export function mock<T>(fn?: T): any;
  export function spyOn(...args: unknown[]): any;
}
