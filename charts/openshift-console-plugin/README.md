# Security hardening

## Helm chart deployment

When deploying via the Helm chart, the following security features are **enabled by default**:

- **TLS hardening** — nginx is configured with explicit `ssl_protocols`, `ssl_ciphers`,
  `ssl_prefer_server_ciphers`, and `ssl_ecdh_curve` directives (see `values.yaml` → `plugin.nginx.*`).
- **Post-Quantum Cryptography (PQC)** — the `ssl_ecdh_curve` default includes ML-KEM hybrid key
  exchanges (`SecP256r1MLKEM768`, `SecP384r1MLKEM1024`) alongside classical ECDH curves, and the
  container image uses `ubi10/nginx-126` which ships an OpenSSL build that supports them.
- **NetworkPolicy** — a `NetworkPolicy` restricts ingress to the plugin pod so that only the
  `openshift-console` namespace can reach it on the plugin port
  (`values.yaml` → `plugin.networkPolicy.enabled: true`).

All values are overridable — set `plugin.nginx.*` or `plugin.networkPolicy.enabled` in your
Helm values to customise.

## Operator deployment

When the plugin is delivered by the OSC operator, the **operator itself** is responsible for
passing and patching the TLS configuration (protocols, ciphers, ECDH curves) into the plugin's
nginx ConfigMap. The Helm chart values serve as documentation of the expected defaults, but
the operator must reconcile them into the running deployment.
