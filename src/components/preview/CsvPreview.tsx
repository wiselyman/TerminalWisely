import { useMemo } from "react";

interface CsvPreviewProps {
  text: string;
  filter?: string;
}

function parseCsv(text: string, maxRows = 500): string[][] {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  return lines.slice(0, maxRows).map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === "," && !inQuotes) {
        cells.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    cells.push(current);
    return cells;
  });
}

export function CsvPreview({ text, filter = "" }: CsvPreviewProps) {
  const rows = useMemo(() => parseCsv(text), [text]);
  const columns = rows[0]?.length ?? 0;

  const filteredRows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      row.some((cell) => cell.toLowerCase().includes(needle)),
    );
  }, [filter, rows]);

  if (rows.length === 0) {
    return <div className="preview-empty">CSV 内容为空</div>;
  }

  return (
    <div className="preview-csv">
      <div className="preview-csv-toolbar">
        <span className="preview-csv-meta">
          {filteredRows.length} / {rows.length} 行
        </span>
      </div>
      <div className="preview-csv-scroll">
        <table>
          <tbody>
            {filteredRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <td key={colIndex}>{row[colIndex] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
