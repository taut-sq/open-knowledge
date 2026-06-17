
export function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function buildClaudeLaunchCommand(prompt: string): string {
  return `claude ${shellSingleQuote(prompt)}\r`;
}
