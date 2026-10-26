# Security hardening

## TLS security profile compliance

Every TLS server on OpenShift must honor the cluster-wide TLS security profile from
`apiservers.config.openshift.io/cluster`. The plugin's nginx server does: no TLS version, cipher,
or group is hard-coded on the default deployment path.

### Helm chart

`plugin.nginx.honorClusterTLSProfile: true` (the default) makes the chart read the APIServer
`cluster` object with Helm's `lookup` at install/upgrade time and render the resolved profile
into `nginx.conf`. OpenShift's API and nginx both use OpenSSL cipher/group names, so values are
passed through without translation.

| APIServer TLS profile field | nginx directive |
|-----------------------------|-----------------|
| `minTLSVersion` | `ssl_protocols` (`VersionTLS13` → `TLSv1.3`; otherwise `TLSv1.2 TLSv1.3`) |
| `ciphers` (TLS 1.2 and below) | `ssl_ciphers` |
| `ciphers` (`TLS_*` suites) | `ssl_conf_command Ciphersuites` |
| `groups` | `ssl_ecdh_curve` |
| ALPN (not part of the profile) | `http2 on;` → `h2, http/1.1` |
| `tlsAdherence` | always honored; see below |

- The built-in `Old`, `Intermediate` (default) and `Modern` profiles are embedded (Mozilla Server
  Side TLS 5.8, matching `openshift/api`). `Custom` uses its `minTLSVersion`, `ciphers` and
  `groups`. A custom profile with an empty `groups` list gets the built-in group preference.
- `Old` (and custom profiles) asking for TLS 1.0/1.1 are clamped to TLS 1.2: OpenSSL 3 in UBI 9
  disables the older protocols. The `Old` cipher list is still applied to TLS 1.2.
- When the APIServer cannot be read (`helm template`, `--dry-run`, or a non-OpenShift cluster),
  the chart falls back to `plugin.nginx.tlsProfile` when its `type` is set, otherwise to the raw
  `plugin.nginx.ssl_*` values. Those defaults are the Intermediate profile.
- `tlsAdherence` is honored implicitly: the plugin always applies the configured profile, which
  keeps existing behavior under `LegacyAdheringComponentsOnly` (and the unset default) and is
  compliant under `StrictAllComponents`. Unknown values are treated like `StrictAllComponents`,
  per the API contract.
- The Deployment carries a `checksum/nginx-conf` annotation, so re-running `helm upgrade` after a
  profile change rolls the pods with the new configuration.

`helm upgrade` only re-resolves the profile when it runs. nginx cannot watch the APIServer
itself, so continuous reconciliation is the delivering operator's job (see
[Operator deployment](#operator-deployment)).

### Post-Quantum Cryptography (PQC)

- The runtime image is `ubi9/nginx-126`, which ships OpenSSL 3.5 with ML-KEM.
- The default group order is `X25519MLKEM768:X25519:secp256r1:secp384r1` (the API's
  Intermediate/Modern preference order), so TLS 1.3 negotiates the ML-KEM hybrid key exchange
  with PQC-capable clients while non-PQC clients still connect with the classical groups. This
  was verified end-to-end (`Negotiated TLS1.3 group: X25519MLKEM768`).
- TLS 1.3 cipher suites are pinned explicitly with `ssl_conf_command Ciphersuites`; they are not
  controlled by `ssl_ciphers`.
- ALPN is set explicitly (`h2, http/1.1`) because the cluster profile does not set it.
- No insecure TLS clients: the plugin performs no outbound TLS, and the commands it generates
  never disable certificate verification (`InsecureSkipVerify` / `curl -k`).

### NetworkPolicy

A `NetworkPolicy` restricts ingress to the plugin pods so that only the `openshift-console`
namespace can reach them, and only on the plugin port
(`values.yaml` → `plugin.networkPolicy.enabled: true`). The plugin makes no outbound connections,
so no egress traffic is required.

### Certificate

The serving certificate comes from the OpenShift service CA (`service.beta.openshift.io/
serving-cert-secret-name` annotation on the Service) unless `plugin.certificateSecretName` points
at a user-provided `kubernetes.io/tls` secret.

All values are overridable — set `plugin.nginx.*` or `plugin.networkPolicy.enabled` in your Helm
values to customise. Prefer leaving `honorClusterTLSProfile: true` so the cluster policy stays
authoritative.

## Operator deployment

When the plugin is delivered by the OSC operator, the **operator itself** is responsible for
keeping the plugin's nginx ConfigMap in sync with the cluster TLS profile. The Helm chart is the
reference implementation for the required behavior:

1. Read `apiservers.config.openshift.io/cluster` (watch it; do not read once at startup).
2. Resolve `spec.tlsSecurityProfile` (Old/Intermediate/Modern/Custom), defaulting to Intermediate
   when unset. Honor `tlsAdherence`: `StrictAllComponents` (and unknown values) require the
   profile to be applied without fallback.
3. Patch `nginx.conf` with the same mapping as the table above — including the TLS 1.3
   `Ciphersuites` and the `groups` (`ssl_ecdh_curve`) list, not just `ssl_protocols`/`ssl_ciphers`.
4. Roll the Deployment when the rendered configuration changes (for example, annotate the pod
   template with a hash of the ConfigMap), so existing connections are re-established with the
   new policy.
