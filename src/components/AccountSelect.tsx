import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { UnixGroupEntry, UnixUserEntry } from "../types";

interface AccountSelectProps {
  kind: "user" | "group";
  value: string;
  onChange: (value: string) => void;
  users: UnixUserEntry[];
  groups: UnixGroupEntry[];
  loading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  optional?: boolean;
}

const MAX_VISIBLE = 80;

const PRIORITY_USERS = [
  "root",
  "www-data",
  "nginx",
  "apache",
  "httpd",
  "mysql",
  "postgres",
  "redis",
  "nobody",
];

const PRIORITY_GROUPS = ["root", "www-data", "nginx", "docker", "users", "wheel", "sudo"];

function sortUsers(users: UnixUserEntry[]): UnixUserEntry[] {
  return [...users].sort((a, b) => {
    const ai = PRIORITY_USERS.indexOf(a.name);
    const bi = PRIORITY_USERS.indexOf(b.name);
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return a.name.localeCompare(b.name);
  });
}

function sortGroups(groups: UnixGroupEntry[]): UnixGroupEntry[] {
  return [...groups].sort((a, b) => {
    const ai = PRIORITY_GROUPS.indexOf(a.name);
    const bi = PRIORITY_GROUPS.indexOf(b.name);
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return a.name.localeCompare(b.name);
  });
}

function formatUserLabel(user: UnixUserEntry): string {
  const desc = user.description?.trim();
  return desc ? `${user.name} · UID ${user.uid} · ${desc}` : `${user.name} · UID ${user.uid}`;
}

function formatGroupLabel(group: UnixGroupEntry): string {
  return `${group.name} · GID ${group.gid}`;
}

function matchesUser(user: UnixUserEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (user.name.toLowerCase().includes(q)) return true;
  if (String(user.uid).includes(q)) return true;
  if (user.description?.toLowerCase().includes(q)) return true;
  return false;
}

function matchesGroup(group: UnixGroupEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (group.name.toLowerCase().includes(q)) return true;
  if (String(group.gid).includes(q)) return true;
  return false;
}

export function AccountSelect({
  kind,
  value,
  onChange,
  users,
  groups,
  loading = false,
  placeholder,
  disabled = false,
  optional = false,
}: AccountSelectProps) {
  const { t } = useTranslation("commands");
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const sortedUsers = useMemo(() => sortUsers(users), [users]);
  const sortedGroups = useMemo(() => sortGroups(groups), [groups]);

  const selectedUser = useMemo(
    () => sortedUsers.find((user) => user.name === value),
    [sortedUsers, value],
  );
  const selectedGroup = useMemo(
    () => sortedGroups.find((group) => group.name === value),
    [sortedGroups, value],
  );

  const filteredUsers = useMemo(
    () => sortedUsers.filter((user) => matchesUser(user, query)).slice(0, MAX_VISIBLE),
    [query, sortedUsers],
  );
  const filteredGroups = useMemo(
    () => sortedGroups.filter((group) => matchesGroup(group, query)).slice(0, MAX_VISIBLE),
    [groups, query, sortedGroups],
  );

  const inputValue = open
    ? query
    : kind === "user"
      ? selectedUser
        ? formatUserLabel(selectedUser)
        : value
      : value
        ? selectedGroup
          ? formatGroupLabel(selectedGroup)
          : value
        : optional
          ? ""
          : value;

  const displayPlaceholder =
    placeholder ??
    (kind === "user"
      ? t("run.placeholderUser")
      : optional
        ? t("run.placeholderKeepGroup")
        : t("run.placeholderUser"));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const pickValue = (next: string) => {
    onChange(next);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    const items =
      kind === "user"
        ? filteredUsers
        : optional && activeIndex === 0
          ? []
          : filteredGroups;
    const itemCount = kind === "group" && optional ? filteredGroups.length + 1 : items.length;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        itemCount === 0 ? -1 : Math.min(current + 1, itemCount - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      if (kind === "group" && optional && activeIndex === 0) {
        pickValue("");
        return;
      }
      const index = kind === "group" && optional ? activeIndex - 1 : activeIndex;
      const picked =
        kind === "user" ? filteredUsers[index] : filteredGroups[index];
      if (picked) pickValue(picked.name);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      setQuery("");
    }
  };

  const showDropdown = open && !disabled;

  return (
    <div className="searchable-select account-select" ref={rootRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        value={inputValue}
        placeholder={displayPlaceholder}
        disabled={disabled}
        onFocus={() => {
          setQuery(value);
          setOpen(true);
        }}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          setActiveIndex(-1);
          onChange(next);
        }}
        onKeyDown={onKeyDown}
      />
      {showDropdown ? (
        <ul id={listId} className="searchable-select-list" role="listbox">
          {loading ? (
            <li className="searchable-select-hint">
              {kind === "user" ? t("select.loadingUsers") : t("select.loadingGroups")}
            </li>
          ) : kind === "group" && optional ? (
            <>
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={!value}
                  className={`searchable-select-option account-select-clear${
                    activeIndex === 0 ? " active" : ""
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pickValue("")}
                >
                  {t("run.placeholderKeepGroup")}
                </button>
              </li>
              {filteredGroups.length === 0 ? (
                <li className="searchable-select-hint">
                  {groups.length === 0
                    ? t("select.noGroupsTypeToEnter")
                    : t("select.noGroupsMatchTypeToEnter")}
                </li>
              ) : (
                filteredGroups.map((group, index) => (
                  <li key={group.name}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={group.name === value}
                      className={`searchable-select-option process-select-option${
                        index + 1 === activeIndex ? " active" : ""
                      }`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pickValue(group.name)}
                    >
                      <span className="process-select-name">{group.name}</span>
                      <span className="process-select-meta">GID {group.gid}</span>
                    </button>
                  </li>
                ))
              )}
            </>
          ) : kind === "user" ? (
            filteredUsers.length === 0 ? (
              <li className="searchable-select-hint">
                {users.length === 0
                  ? t("select.noUsersTypeToEnter")
                  : t("select.noUsersMatchTypeToEnter")}
              </li>
            ) : (
              filteredUsers.map((user, index) => (
                <li key={`${user.name}-${user.uid}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={user.name === value}
                    className={`searchable-select-option process-select-option${
                      index === activeIndex ? " active" : ""
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pickValue(user.name)}
                  >
                    <span className="process-select-name">{user.name}</span>
                    <span className="process-select-meta">
                      UID {user.uid}
                      {user.description?.trim()
                        ? ` · ${user.description.trim()}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))
            )
          ) : filteredGroups.length === 0 ? (
            <li className="searchable-select-hint">
              {groups.length === 0
                ? t("select.noGroupsTypeToEnter")
                : t("select.noGroupsMatchTypeToEnter")}
            </li>
          ) : (
            filteredGroups.map((group, index) => (
              <li key={group.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={group.name === value}
                  className={`searchable-select-option process-select-option${
                    index === activeIndex ? " active" : ""
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pickValue(group.name)}
                >
                  <span className="process-select-name">{group.name}</span>
                  <span className="process-select-meta">GID {group.gid}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
