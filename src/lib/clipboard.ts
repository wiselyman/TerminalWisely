export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export async function readClipboardText(): Promise<string> {
  return navigator.clipboard.readText();
}

