import { Leaf } from "lucide-react";
import type { ReactNode } from "react";
import mariadbIcon from "./engine-icons/mariadb.svg?raw";
import mongodbIcon from "./engine-icons/mongodb.svg?raw";
import mysqlIcon from "./engine-icons/mysql.svg?raw";
import oracleIcon from "./engine-icons/oracle.svg?raw";
import postgresIcon from "./engine-icons/postgres.svg?raw";
import redisIcon from "./engine-icons/redis.svg?raw";
import sqliteIcon from "./engine-icons/sqlite.svg?raw";
import sqlserverIcon from "./engine-icons/sqlserver.svg?raw";
import type { ObjectKind, TableGroup } from "./workbenchModel";

/** Same pictorial marks DBX ships under apps/desktop/public/icons/database. */
const ENGINE_MARKS: Record<string, string> = {
  postgres: postgresIcon,
  mysql: mysqlIcon,
  mariadb: mariadbIcon,
  sqlite: sqliteIcon,
  redis: redisIcon,
  mongodb: mongodbIcon,
  sqlserver: sqlserverIcon,
  oracle: oracleIcon,
};

function Glyph({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={className} aria-hidden>
      {children}
    </svg>
  );
}

function Cylinder({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <ellipse cx="8" cy="4.2" rx="4.2" ry="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.8 4.2v6.4c0 1 1.9 1.7 4.2 1.7s4.2-.7 4.2-1.7V4.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </Glyph>
  );
}

function SchemaMark({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <ellipse cx="8" cy="3.3" rx="4" ry="1.35" fill="none" stroke="currentColor" strokeWidth="1.15" />
      <path d="M4 3.3v3.1c0 .8 1.8 1.45 4 1.45s4-.65 4-1.45V3.3" fill="none" stroke="currentColor" strokeWidth="1.15" />
      <ellipse cx="8" cy="8.7" rx="4" ry="1.35" fill="none" stroke="currentColor" strokeWidth="1.15" />
      <path d="M4 8.7v3c0 .8 1.8 1.45 4 1.45s4-.65 4-1.45v-3" fill="none" stroke="currentColor" strokeWidth="1.15" />
    </Glyph>
  );
}

function TableSheet({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.15" />
      <path d="M2.4 5.8h11.2" stroke="currentColor" strokeWidth="1.15" />
      <path d="M2.4 9h11.2M2.4 11.6h11.2" stroke="currentColor" strokeWidth="1" />
    </Glyph>
  );
}

function FieldSheet({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <rect x="3.2" y="2.3" width="9.6" height="11.4" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.15" />
      <path d="M3.2 5.5h9.6" stroke="currentColor" strokeWidth="1.15" />
      <path d="M6.4 5.5v8.2M9.6 5.5v8.2" stroke="currentColor" strokeWidth="1" />
    </Glyph>
  );
}

function KeyMark({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <circle cx="6" cy="6" r="2.35" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path d="M7.9 7.2 12.5 11.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M10 9.2 11.4 10.6M11.3 10.5 12.6 11.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Glyph>
  );
}

function IndexMark({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <text x="0.6" y="11.2" fill="currentColor" fontSize="7.2" fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight="700">
        A-Z
      </text>
    </Glyph>
  );
}

function LinkMark({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <ellipse cx="5.3" cy="6.1" rx="2.5" ry="1.7" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <ellipse cx="10.5" cy="9.7" rx="2.5" ry="1.7" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </Glyph>
  );
}

function UniqueMark({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <rect x="3" y="3" width="10" height="10" rx="1.4" fill="#f3e6d4" stroke="#d7b48a" strokeWidth="1" />
      <rect x="4.3" y="7" width="7.4" height="1.8" rx="0.4" fill="#e07a3d" />
    </Glyph>
  );
}

function CheckMark({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <circle cx="8" cy="8" r="5.2" fill="#d9d0f0" />
      <path d="M5.2 8.2 7.1 10.1 10.8 6.2" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Glyph>
  );
}

function ExclusionMark({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <rect x="2.2" y="2.6" width="7.6" height="10.4" rx="1" fill="#e7e9ec" stroke="#b7bcc3" strokeWidth="1" />
      <path d="M10.2 8h3.2M11.8 6.5 13.6 8 11.8 9.5" fill="none" stroke="#e07a3d" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </Glyph>
  );
}

function RuleMark({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M3 4.6h10M3 8h10M3 11.4h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Glyph>
  );
}

function TriggerMark({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M9.1 1.8 4.2 8.8h3.3L6.5 14.2 12.2 6.5H8.7L9.1 1.8Z" fill="#f0b429" />
    </Glyph>
  );
}

function Binoculars({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <circle cx="4.7" cy="9.3" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11.3" cy="9.3" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.9 8.7h2.2M4.7 4.4 5.8 6.8M11.3 4.4 10.2 6.8" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    </Glyph>
  );
}

function FunctionMark({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <text x="2.4" y="12" fill="currentColor" fontSize="9" fontFamily="Georgia, serif" fontStyle="italic">
        fx
      </text>
    </Glyph>
  );
}

function ClockMark({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 4.8V8l2.1 1.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Glyph>
  );
}

export function EngineMark({ engine }: { engine: string }) {
  const markup = ENGINE_MARKS[engine];
  const className = `db-engine-icon db-engine-icon--${engine}`;
  if (!markup) return <Cylinder className={className} />;
  return <span className={className} dangerouslySetInnerHTML={{ __html: markup }} />;
}

export function ObjectMark({ kind }: { kind: ObjectKind | "database" | "schema" }) {
  if (kind === "database") return <Cylinder className="db-kind-icon db-kind-icon--database" />;
  if (kind === "schema") return <SchemaMark className="db-kind-icon db-kind-icon--schema" />;
  if (kind === "table") return <TableSheet className="db-kind-icon db-kind-icon--table" />;
  if (kind === "view") return <Binoculars className="db-kind-icon db-kind-icon--view" />;
  if (kind === "materialized_view") return <Binoculars className="db-kind-icon db-kind-icon--materialized_view" />;
  if (kind === "routine") return <FunctionMark className="db-kind-icon db-kind-icon--routine" />;
  if (kind === "event") return <ClockMark className="db-kind-icon db-kind-icon--routine" />;
  if (kind === "key") return <KeyMark className="db-kind-icon db-kind-icon--key" />;
  return <Leaf size={16} className="db-kind-icon db-kind-icon--collection" aria-hidden />;
}

export function GroupMark({ group }: { group: TableGroup }) {
  if (group === "field") return <FieldSheet className="db-kind-icon db-kind-icon--field" />;
  if (group === "index") return <IndexMark className="db-kind-icon db-kind-icon--index" />;
  if (group === "foreign_key") return <LinkMark className="db-kind-icon db-kind-icon--foreign_key" />;
  if (group === "unique") return <UniqueMark className="db-kind-icon db-kind-icon--unique" />;
  if (group === "check") return <CheckMark className="db-kind-icon db-kind-icon--check" />;
  if (group === "exclusion") return <ExclusionMark className="db-kind-icon db-kind-icon--exclusion" />;
  if (group === "rule") return <RuleMark className="db-kind-icon db-kind-icon--rule" />;
  return <TriggerMark className="db-kind-icon db-kind-icon--trigger" />;
}

export function ColumnMark({ primary }: { primary: boolean }) {
  if (primary) return <KeyMark className="db-kind-icon db-kind-icon--primary" />;
  return <FieldSheet className="db-kind-icon db-kind-icon--column" />;
}
