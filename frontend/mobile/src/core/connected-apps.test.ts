import { connectedStates, connectorKeyFor } from "@/core/connected-apps";

const app = (clientName: string | null, active: boolean) => ({ clientId: clientName ?? "x", clientName, scope: "mcp", active });

describe("connectorKeyFor", () => {
  it("matches the known assistants by name, case-insensitively", () => {
    expect(connectorKeyFor("Claude")).toBe("claude");
    expect(connectorKeyFor("ChatGPT")).toBe("chatgpt");
    expect(connectorKeyFor("OpenAI MCP")).toBe("chatgpt");
    expect(connectorKeyFor("Gemini CLI")).toBe("gemini");
  });

  it("sends unknown or unnamed apps to Other", () => {
    expect(connectorKeyFor("My own client")).toBe("other");
    expect(connectorKeyFor(null)).toBe("other");
  });
});

describe("connectedStates", () => {
  it("is empty without apps", () => {
    expect(connectedStates(undefined)).toEqual({});
    expect(connectedStates([])).toEqual({});
  });

  it("marks a card active when any of its apps can renew access", () => {
    expect(connectedStates([app("Claude", false), app("Claude", true)])).toEqual({ claude: "active" });
    expect(connectedStates([app("Claude", true), app("Claude", false)])).toEqual({ claude: "active" });
  });

  it("marks a card connected when its consent is kept but nothing is signed in", () => {
    expect(connectedStates([app("ChatGPT", false), app("Foo", true)])).toEqual({ chatgpt: "connected", other: "active" });
  });
});
