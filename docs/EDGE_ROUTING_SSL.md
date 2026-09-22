# Lelefa Chambers production edge: DNS, Nginx and SSL

This document prepares the public production addresses before the application deployment.

## Production hostnames

| Hostname | Purpose | Target |
| --- | --- | --- |
| `lelefachambers.co.ls` | Primary public site and application | VPS public IPv4 |
| `www.lelefachambers.co.ls` | Convenience alias; redirects to primary hostname | VPS public IPv4 or CNAME to `lelefachambers.co.ls` |
| `api.lelefachambers.co.ls` | FastAPI production API | VPS public IPv4 |

The Docker services themselves listen only on host loopback:

- Next.js: `127.0.0.1:3000`
- FastAPI: `127.0.0.1:8000`

PostgreSQL and Redis are not published to the host network.

## 1. DNS records

At the authoritative DNS provider create or confirm:

```text
A     lelefachambers.co.ls       <VPS_PUBLIC_IPV4>
A     api.lelefachambers.co.ls   <VPS_PUBLIC_IPV4>
CNAME www.lelefachambers.co.ls   lelefachambers.co.ls.
```

If the DNS provider does not support a CNAME for `www`, use an A record pointing to the same VPS IPv4.

Do not create an AAAA record unless the VPS is actually configured to receive IPv6 traffic on ports 80 and 443.

Check propagation from the VPS before requesting TLS:

```bash
EXPECTED_VPS_IP=<VPS_PUBLIC_IPV4> bash scripts/check-production-dns.sh
```

All three names must resolve correctly first.

## 2. Firewall

The public firewall should permit only what is required. For this application edge:

```text
22/tcp   SSH administration (prefer source restriction where practical)
80/tcp   HTTP / ACME challenge / redirect
443/tcp  HTTPS
```

Do **not** expose host ports 3000, 8000, 5432 or 6379 publicly. The Compose file binds 3000 and 8000 to `127.0.0.1`; PostgreSQL and Redis stay inside the Compose network.

## 3. Production environment

Create the production environment from the committed template:

```bash
cp .env.production.example .env
chmod 600 .env
```

Replace every `CHANGE_THIS_*` value. Production URLs must remain:

```env
APP_ENV=production
NEXT_PUBLIC_SITE_URL=https://lelefachambers.co.ls
NEXT_PUBLIC_API_URL=https://api.lelefachambers.co.ls
SERVER_API_URL=http://api:8000
CORS_ORIGINS=https://lelefachambers.co.ls,https://www.lelefachambers.co.ls
```

The browser talks to the HTTPS API hostname. Server-side Next.js requests use the private Docker service name `api:8000`.

## 4. Bootstrap Nginx over HTTP

Nginx and Certbot must be installed on the VPS before this step. With the repository checked out on the server:

```bash
sudo bash scripts/prepare-nginx-host.sh bootstrap
```

This installs the HTTP-only configuration and creates `/var/www/letsencrypt` for ACME challenges. It proxies the site to `127.0.0.1:3000` and the API to `127.0.0.1:8000` once the application is running.

The bootstrap configuration can be enabled before the application deployment; upstream requests may return 502 until the containers are started, but the ACME challenge path remains available.

## 5. Request the Let's Encrypt certificate

Only after DNS propagation succeeds:

```bash
sudo LETSENCRYPT_EMAIL=admin@lelefachambers.co.ls bash scripts/issue-letsencrypt.sh
```

The certificate covers:

- `lelefachambers.co.ls`
- `www.lelefachambers.co.ls`
- `api.lelefachambers.co.ls`

The certificate is stored under:

```text
/etc/letsencrypt/live/lelefachambers.co.ls/
```

## 6. Enable HTTPS configuration

After successful certificate issuance:

```bash
sudo bash scripts/prepare-nginx-host.sh tls
```

The production configuration:

- redirects HTTP to HTTPS;
- redirects `www.lelefachambers.co.ls` to `lelefachambers.co.ls`;
- sends public web traffic to Next.js on loopback port 3000;
- sends `api.lelefachambers.co.ls` to FastAPI on loopback port 8000;
- forwards the original host, client IP and HTTPS scheme;
- supports upgraded/WebSocket connections;
- permits legal-document API requests up to 30 MB at the reverse proxy;
- sets HSTS and baseline security headers.

## 7. Certificate renewal

A normal Certbot installation installs a systemd timer. Verify it:

```bash
systemctl status certbot.timer
sudo certbot renew --dry-run
```

Nginx reads the same stable certificate path after renewals.

## 8. Application deployment comes next

After DNS, Nginx and TLS are ready, deploy the application according to `docs/PRODUCTION_DEPLOYMENT.md`.

For a new database:

```bash
docker compose build

docker compose run --rm api alembic upgrade head

docker compose up -d
```

For an existing pre-Alembic production database, follow the documented backup/schema-verification/stamp procedure instead of blindly running the baseline revision.

Finally run:

```bash
bash scripts/verify-production.sh
```

and manually verify:

- `https://lelefachambers.co.ls`
- `https://lelefachambers.co.ls/chambers-admin`
- `https://lelefachambers.co.ls/client-portal`
- `https://api.lelefachambers.co.ls/health/live`
- `https://api.lelefachambers.co.ls/health/ready`

## Important boundary

The repository can prepare and validate the DNS targets, reverse-proxy configuration and TLS procedure, but changing the authoritative DNS zone and changing the VPS itself are deployment operations. They require access to the DNS provider and the production server and should be performed only during the deployment/cutover step.
