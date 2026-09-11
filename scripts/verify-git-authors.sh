#!/usr/bin/env bash
# Fail if any commit reachable from HEAD is attributed to Cursor.
set -euo pipefail

bad=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  echo "author-guard: forbidden attribution: $line" >&2
  bad=1
done < <(
  git log --format='%H %an <%ae> | %cn <%ce>%b' HEAD |
    grep -iE 'cursoragent@cursor\.com|Co-authored-by:.*[Cc]ursor|Made-with: Cursor' || true
)

if [ "$bad" -ne 0 ]; then
  echo "author-guard: history contains Cursor attribution — rewrite or squash before push." >&2
  exit 1
fi

echo "author-guard: OK (no Cursor author/co-author in reachable history)"
