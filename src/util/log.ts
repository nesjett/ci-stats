export interface Logger {
  info(msg: string): void;
  debug(msg: string): void;
}

export function createLogger(verbose: boolean): Logger {
  const encoder = new TextEncoder();
  const write = (msg: string) => {
    Deno.stderr.writeSync(encoder.encode(msg + "\n"));
  };
  return {
    info: write,
    debug: verbose ? write : () => {},
  };
}
