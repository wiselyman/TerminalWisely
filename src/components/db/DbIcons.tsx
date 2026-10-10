import {
  ArrowDownAZ,
  Ban,
  Binoculars,
  CircleCheck,
  Clock,
  Columns3,
  Database,
  FileCode,
  FunctionSquare,
  KeyRound,
  Layers,
  Leaf,
  Link2,
  List,
  Table2,
  Zap,
} from "lucide-react";
import mariadbIcon from "./engine-icons/mariadb.svg?raw";
import mongodbIcon from "./engine-icons/mongodb.svg?raw";
import mysqlIcon from "./engine-icons/mysql.svg?raw";
import oracleIcon from "./engine-icons/oracle.svg?raw";
import postgresIcon from "./engine-icons/postgres.svg?raw";
import redisIcon from "./engine-icons/redis.svg?raw";
import sqliteIcon from "./engine-icons/sqlite.svg?raw";
import sqlserverIcon from "./engine-icons/sqlserver.svg?raw";
import type { ObjectKind, TableGroup } from "./workbenchModel";

/** Brand marks under apps/desktop/public/icons/database (engine chrome only). */
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

const ICON_SIZE = 14;
const ICON_STROKE = 1.75;

function markProps(className: string) {
  return {
    size: ICON_SIZE,
    strokeWidth: ICON_STROKE,
    className,
    "aria-hidden": true as const,
  };
}

function kindClass(base: string, active: boolean): string {
  return active ? base : `${base} db-kind-icon--muted`;
}

/** Brand engine mark. Disconnected connections stay grayscale (Navicat). */
export function EngineMark({
  engine,
  connected = true,
}: {
  engine: string;
  connected?: boolean;
}) {
  const markup = ENGINE_MARKS[engine];
  const className = [
    "db-engine-icon",
    `db-engine-icon--${engine}`,
    connected ? "" : "db-engine-icon--muted",
  ]
    .filter(Boolean)
    .join(" ");
  if (!markup) {
    return <Database {...markProps(className)} />;
  }
  return <span className={className} dangerouslySetInnerHTML={{ __html: markup }} />;
}

/** Object tree marks. Unopened database/schema nodes stay muted until cataloged/opened. */
export function ObjectMark({
  kind,
  active = true,
}: {
  kind: ObjectKind | "database" | "schema";
  active?: boolean;
}) {
  if (kind === "database") {
    return <Database {...markProps(kindClass("db-kind-icon db-kind-icon--database", active))} />;
  }
  if (kind === "schema") {
    return <Layers {...markProps(kindClass("db-kind-icon db-kind-icon--schema", active))} />;
  }
  if (kind === "table") {
    return <Table2 {...markProps(kindClass("db-kind-icon db-kind-icon--table", active))} />;
  }
  if (kind === "view") {
    return <Binoculars {...markProps(kindClass("db-kind-icon db-kind-icon--view", active))} />;
  }
  if (kind === "materialized_view") {
    return (
      <Binoculars
        {...markProps(kindClass("db-kind-icon db-kind-icon--materialized_view", active))}
      />
    );
  }
  if (kind === "routine") {
    return <FunctionSquare {...markProps(kindClass("db-kind-icon db-kind-icon--routine", active))} />;
  }
  if (kind === "event") {
    return <Clock {...markProps(kindClass("db-kind-icon db-kind-icon--routine", active))} />;
  }
  if (kind === "key") {
    return <KeyRound {...markProps(kindClass("db-kind-icon db-kind-icon--key", active))} />;
  }
  return <Leaf {...markProps(kindClass("db-kind-icon db-kind-icon--collection", active))} />;
}

export function GroupMark({ group }: { group: TableGroup }) {
  if (group === "field") {
    return <Columns3 {...markProps("db-kind-icon db-kind-icon--field")} />;
  }
  if (group === "index") {
    return <ArrowDownAZ {...markProps("db-kind-icon db-kind-icon--index")} />;
  }
  if (group === "foreign_key") {
    return <Link2 {...markProps("db-kind-icon db-kind-icon--foreign_key")} />;
  }
  if (group === "unique") {
    return <KeyRound {...markProps("db-kind-icon db-kind-icon--unique")} />;
  }
  if (group === "check") {
    return <CircleCheck {...markProps("db-kind-icon db-kind-icon--check")} />;
  }
  if (group === "exclusion") {
    return <Ban {...markProps("db-kind-icon db-kind-icon--exclusion")} />;
  }
  if (group === "rule") {
    return <List {...markProps("db-kind-icon db-kind-icon--rule")} />;
  }
  return <Zap {...markProps("db-kind-icon db-kind-icon--trigger")} />;
}

export function ColumnMark({ primary }: { primary: boolean }) {
  if (primary) {
    return <KeyRound {...markProps("db-kind-icon db-kind-icon--primary")} />;
  }
  return <Columns3 {...markProps("db-kind-icon db-kind-icon--column")} />;
}

/** SQL query inner-tab mark (parallel to ObjectMark on object tabs). */
export function QueryMark() {
  return <FileCode {...markProps("db-kind-icon db-kind-icon--query")} />;
}
