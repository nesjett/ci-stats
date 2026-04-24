if (import.meta.main) {
  const { run } = await import("./cli/run.ts");
  Deno.exit(await run(Deno.args));
}
