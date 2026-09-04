import { auth } from "@cartwright/auth";
import { toNextJsHandler } from "better-auth/next-js";

// With Cache Components enabled the `dynamic` segment config is not allowed
// on route handlers; auth runs at request time anyway because better-auth
// reads cookies()/headers().
export const { GET, POST } = toNextJsHandler(auth);
