export function mustGetArg(flag: string): string {
  const i = process.argv.indexOf(flag);
  if (i === -1 || !process.argv[i + 1]) {
    throw new Error(`Missing required argument: ${flag}`);
  }
  return process.argv[i + 1];
}
