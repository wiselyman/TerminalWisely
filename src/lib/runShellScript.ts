export function isShellScriptPath(path: string): boolean {
  return path.toLocaleLowerCase().endsWith(".sh");
}

function quotePosixShellArgument(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function buildRunShellScriptCommand(path: string): string {
  const separator = path.lastIndexOf("/");
  const parent = separator > 0 ? path.slice(0, separator) : "/";
  const basename = path.slice(separator + 1);
  return `cd -- ${quotePosixShellArgument(parent)} && bash -- ${quotePosixShellArgument(`./${basename}`)}\r`;
}
