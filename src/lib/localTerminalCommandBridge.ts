type CommandSink = (command: string) => void;

let sink: CommandSink | null = null;
const pending: string[] = [];

export function registerLocalTerminalCommandSink(nextSink: CommandSink): () => void {
  sink = nextSink;
  for (const command of pending.splice(0)) nextSink(command);
  return () => {
    if (sink === nextSink) sink = null;
  };
}

export function queueLocalTerminalCommand(command: string): void {
  if (sink) sink(command);
  else pending.push(command);
}
