import type { GhClient, GhResult } from "../src/gh/client.ts";

export class FakeGhClient implements GhClient {
  public readonly calls: string[][] = [];
  constructor(private readonly responses: Map<string, GhResult | string>) {}

  run(args: readonly string[]): Promise<GhResult> {
    const frozen = [...args];
    this.calls.push(frozen);
    const key = frozen.join(" ");
    const entry = this.responses.get(key);
    if (entry === undefined) {
      return Promise.resolve({
        stdout: "",
        stderr: `FakeGhClient: no response registered for: gh ${key}`,
        code: 1,
      });
    }
    if (typeof entry === "string") {
      return Promise.resolve({ stdout: entry, stderr: "", code: 0 });
    }
    return Promise.resolve(entry);
  }
}

export async function loadFixture(name: string): Promise<string> {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return await Deno.readTextFile(url);
}
