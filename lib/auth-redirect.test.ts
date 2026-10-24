import { describe, expect, it } from "vitest";

import { needsSignIn, resolveRedirect } from "./auth-redirect";

describe("needsSignIn", () => {
  it("protects the app surfaces", () => {
    expect(needsSignIn("/dashboard")).toBe(true);
    expect(needsSignIn("/chapters/abc/workspace")).toBe(true);
    expect(needsSignIn("/groups/example")).toBe(true);
  });

  it("leaves public routes alone", () => {
    expect(needsSignIn("/")).toBe(false);
    expect(needsSignIn("/login")).toBe(false);
    expect(needsSignIn("/dashboardish")).toBe(false);
  });
});

describe("resolveRedirect", () => {
  it("sends an anonymous visitor to login", () => {
    expect(resolveRedirect("/dashboard", false)).toBe("/login");
  });

  it("never bounces a session off the auth pages", () => {
    // The regression: this used to return "/dashboard", which looped forever
    // for a user whose profile row was missing or unreadable.
    expect(resolveRedirect("/login", true)).toBeNull();
    expect(resolveRedirect("/register", true)).toBeNull();
  });

  it("does not redirect a signed-in viewer anywhere", () => {
    expect(resolveRedirect("/dashboard", true)).toBeNull();
  });
});
