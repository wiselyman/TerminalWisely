export function createMarkdownOpenDrain(
  takePending: () => Promise<string[]>,
  deliver: (path: string) => Promise<void>,
): () => Promise<void> {
  let active = false;
  let requestedWhileActive = false;

  return async () => {
    if (active) {
      requestedWhileActive = true;
      return;
    }
    active = true;
    try {
      do {
        requestedWhileActive = false;
        const paths = await takePending();
        for (const path of paths) await deliver(path);
        if (paths.length > 0) requestedWhileActive = true;
      } while (requestedWhileActive);
    } finally {
      active = false;
    }
  };
}
