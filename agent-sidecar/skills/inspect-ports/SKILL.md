# Inspect listening ports and socket owners

tags: port, ports, listen, listener, ss, netstat, socket

# Inspect ports

Use read-only probes first:

- `list_listeners` or `ss -tulpn`
- Match PID/program to systemd unit with `systemctl status`

Never mutate firewall rules without explicit approval.
