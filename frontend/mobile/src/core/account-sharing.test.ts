import {
  authorLine,
  canManage,
  canPost,
  categoryScope,
  memberName,
  sameOwnerAccounts,
  writableAccounts,
} from "./account-sharing";

describe("what a role may do", () => {
  it("lets owners and editors post, and not viewers", () => {
    expect(canPost({ role: "OWNER" })).toBe(true);
    expect(canPost({ role: "EDITOR" })).toBe(true);
    expect(canPost({ role: "VIEWER" })).toBe(false);
    expect(canPost(undefined)).toBe(false);
  });

  it("lets only the owner manage", () => {
    expect(canManage({ role: "OWNER" })).toBe(true);
    expect(canManage({ role: "EDITOR" })).toBe(false);
    expect(canManage({ role: "VIEWER" })).toBe(false);
  });

  it("treats an account with no role as the viewer's own", () => {
    expect(canPost({})).toBe(true);
    expect(canManage({})).toBe(true);
  });
});

describe("writableAccounts", () => {
  it("leaves out view-only accounts", () => {
    const list = [{ id: "a", role: "OWNER" as const }, { id: "b", role: "VIEWER" as const }];
    expect(writableAccounts(list).map((a) => a.id)).toEqual(["a"]);
  });
});

describe("sameOwnerAccounts", () => {
  const list = [
    { id: "mine", userId: "me" },
    { id: "joint", userId: "them" },
  ];

  it("keeps accounts with the same owner", () => {
    expect(sameOwnerAccounts(list, { userId: "me" }).map((a) => a.id)).toEqual(["mine"]);
  });

  it("keeps everything until the other side is known", () => {
    expect(sameOwnerAccounts(list, undefined)).toHaveLength(2);
  });
});

describe("categoryScope", () => {
  it("is the account for a member, whose categories are the owner's", () => {
    expect(categoryScope({ id: "a", role: "EDITOR" })).toBe("a");
  });

  it("is nothing for the owner, or with no account", () => {
    expect(categoryScope({ id: "a", role: "OWNER" })).toBeUndefined();
    expect(categoryScope({ id: "a" })).toBeUndefined();
    expect(categoryScope(undefined)).toBeUndefined();
  });
});

describe("memberName", () => {
  it("prefers the name, then the address, and never shows nothing", () => {
    expect(memberName({ displayName: "Sam", email: "s@x.io" })).toBe("Sam");
    expect(memberName({ displayName: " ", email: "s@x.io" })).toBe("s@x.io");
    expect(memberName({})).toBe("A member");
  });
});

describe("authorLine", () => {
  const sam = { id: "1", displayName: "Sam" };
  const lee = { id: "2", displayName: "Lee" };

  it("names who added it, and who edited it", () => {
    expect(authorLine({ createdBy: sam, updatedBy: lee }, "9")).toBe("Added by Sam, edited by Lee");
  });

  it("says you for the viewer", () => {
    expect(authorLine({ createdBy: sam }, "1")).toBe("Added by you");
  });

  it("copes with someone who left MoFin", () => {
    expect(authorLine({ createdBy: null, updatedBy: lee }, "9")).toBe("Edited by Lee");
    expect(authorLine({ createdBy: null }, "9")).toBeNull();
  });
});
