import { useTranslation } from "react-i18next";
import type { LoggedInUser } from "../../types";

interface HostStatsUserListProps {
  users: LoggedInUser[];
}

function formatUserMeta(user: LoggedInUser): string {
  return [user.terminal, user.host, user.login_time].filter(Boolean).join(" · ") || "—";
}

export function HostStatsUserList({ users }: HostStatsUserListProps) {
  const { t } = useTranslation("tools");
  return (
    <section className="host-stats-section host-stats-users-compact">
      <h3 className="host-stats-section-title">{t("hostStats.loggedInUsers")}</h3>
      {users.length === 0 ? (
        <p className="host-stats-empty">{t("hostStats.noLoggedInUsers")}</p>
      ) : (
        <ul className="host-stats-user-list">
          {users.map((user, index) => (
            <li
              key={`${user.username}-${user.terminal ?? index}`}
              className="host-stats-user-row"
            >
              <span className="host-stats-user-name">{user.username}</span>
              <span className="host-stats-user-meta">{formatUserMeta(user)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
