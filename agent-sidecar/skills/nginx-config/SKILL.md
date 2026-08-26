# Nginx configuration checks

tags: nginx, 502, 503, upstream, config, web, proxy

# Nginx triage

Read-only first:

- `service_status nginx`
- `grep_remote_logs` unit nginx + error
- `read_remote_file` for `/etc/nginx/nginx.conf` snippets (small limits)

Config tests (`nginx -t`) are R0 reads. Reload requires approval.
