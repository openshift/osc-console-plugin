{{/*
Resolve the TLS settings for the plugin's nginx server from the cluster-wide TLS
security profile (apiservers.config.openshift.io/cluster), per the OpenShift
centralized-TLS enhancement.

Precedence:
  1. the APIServer `cluster` profile, when plugin.nginx.honorClusterTLSProfile is
     true and the profile is set (resolved with Helm's `lookup` at install or
     upgrade time; `helm template` has no cluster and falls through to 2/3);
  2. an explicit plugin.nginx.tlsProfile.type (Old / Intermediate / Modern /
     Custom);
  3. the raw plugin.nginx.ssl_* values (the Intermediate profile by default).

Returns JSON with the nginx-ready directive values:
  protocols    -> ssl_protocols
  ciphers      -> ssl_ciphers (TLS 1.2 and below; OpenSSL cipher-list syntax)
  ciphersuites -> ssl_conf_command Ciphersuites (TLS 1.3)
  groups       -> ssl_ecdh_curve (incl. ML-KEM hybrid groups for PQC)
  source       -> "cluster", "profile", or "values" (for the ConfigMap comment)

The OpenShift API and nginx both use OpenSSL cipher/group names, so the profile
ciphers and groups are passed through without translation.
*/}}
{{- define "openshift-console-plugin.nginxTLS" -}}
{{- $groups := list "X25519MLKEM768" "X25519" "secp256r1" "secp384r1" -}}
{{- $tls13 := list "TLS_AES_128_GCM_SHA256" "TLS_AES_256_GCM_SHA384" "TLS_CHACHA20_POLY1305_SHA256" -}}
{{- $intermediateLegacy := list
      "ECDHE-ECDSA-AES128-GCM-SHA256" "ECDHE-RSA-AES128-GCM-SHA256"
      "ECDHE-ECDSA-AES256-GCM-SHA384" "ECDHE-RSA-AES256-GCM-SHA384"
      "ECDHE-ECDSA-CHACHA20-POLY1305" "ECDHE-RSA-CHACHA20-POLY1305" -}}
{{- $oldLegacy := concat $intermediateLegacy (list
      "ECDHE-ECDSA-AES128-SHA256" "ECDHE-RSA-AES128-SHA256"
      "ECDHE-ECDSA-AES128-SHA" "ECDHE-RSA-AES128-SHA"
      "ECDHE-ECDSA-AES256-SHA384" "ECDHE-RSA-AES256-SHA384"
      "ECDHE-ECDSA-AES256-SHA" "ECDHE-RSA-AES256-SHA"
      "AES128-GCM-SHA256" "AES256-GCM-SHA384"
      "AES128-SHA256" "AES256-SHA256"
      "AES128-SHA" "AES256-SHA" "DES-CBC3-SHA") -}}
{{- $profiles := dict
      "Old" (dict "minTLSVersion" "VersionTLS10" "ciphers" (concat $tls13 $oldLegacy) "groups" $groups)
      "Intermediate" (dict "minTLSVersion" "VersionTLS12" "ciphers" (concat $tls13 $intermediateLegacy) "groups" $groups)
      "Modern" (dict "minTLSVersion" "VersionTLS13" "ciphers" $tls13 "groups" $groups) -}}

{{- $selected := dict -}}
{{- $source := "values" -}}
{{- if .Values.plugin.nginx.honorClusterTLSProfile -}}
  {{- $api := lookup "config.openshift.io/v1" "APIServer" "" "cluster" -}}
  {{- if $api -}}
    {{- $selected = dig "spec" "tlsSecurityProfile" dict $api -}}
    {{/* No profile set means the platform default: Intermediate. */}}
    {{- if not (dig "type" "" $selected) -}}
      {{- $selected = dict "type" "Intermediate" -}}
    {{- end -}}
    {{- $source = "cluster" -}}
  {{- end -}}
{{- end -}}
{{- if not (dig "type" "" $selected) -}}
  {{- $selected = .Values.plugin.nginx.tlsProfile | default dict -}}
  {{- if dig "type" "" $selected -}}
    {{- $source = "profile" -}}
  {{- end -}}
{{- end -}}

{{- $type := dig "type" "" $selected -}}
{{- $spec := dict -}}
{{- if eq $type "Custom" -}}
  {{- $custom := dig "custom" dict $selected -}}
  {{- $spec = dict
        "minTLSVersion" (dig "minTLSVersion" "VersionTLS12" $custom)
        "ciphers" (dig "ciphers" (list) $custom)
        "groups" (dig "groups" (list) $custom) -}}
{{- else if hasKey $profiles $type -}}
  {{- $spec = index $profiles $type -}}
{{- end -}}

{{- $out := dict
      "protocols" .Values.plugin.nginx.ssl_protocols
      "ciphers" .Values.plugin.nginx.ssl_ciphers
      "ciphersuites" .Values.plugin.nginx.ssl_ciphersuites
      "groups" .Values.plugin.nginx.ssl_ecdh_curve
      "source" "values" -}}
{{- if $spec -}}
  {{/* OpenSSL 3 disables TLS 1.0/1.1, so Old and Custom can only go down to 1.2. */}}
  {{- $protocols := "TLSv1.2 TLSv1.3" -}}
  {{- if eq $spec.minTLSVersion "VersionTLS13" -}}
    {{- $protocols = "TLSv1.3" -}}
  {{- end -}}
  {{- $legacy := list -}}
  {{- $tls13 := list -}}
  {{- range $c := $spec.ciphers -}}
    {{- if hasPrefix "TLS_" $c -}}
      {{- $tls13 = append $tls13 $c -}}
    {{- else -}}
      {{- $legacy = append $legacy $c -}}
    {{- end -}}
  {{- end -}}
  {{- $ciphers := join ":" $legacy -}}
  {{- if not $ciphers -}}
    {{- $ciphers = .Values.plugin.nginx.ssl_ciphers -}}
  {{- end -}}
  {{- $ciphersuites := join ":" $tls13 -}}
  {{- if not $ciphersuites -}}
    {{- $ciphersuites = .Values.plugin.nginx.ssl_ciphersuites -}}
  {{- end -}}
  {{- $curve := $spec.groups -}}
  {{- if not $curve -}}
    {{- $curve = $groups -}}
  {{- end -}}
  {{- $out = dict
        "protocols" $protocols
        "ciphers" $ciphers
        "ciphersuites" $ciphersuites
        "groups" (join ":" $curve)
        "source" $source -}}
{{- end -}}
{{- toJson $out -}}
{{- end -}}
