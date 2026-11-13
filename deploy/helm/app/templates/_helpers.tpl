{{- define "app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "app.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "app.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "app.selectorLabels" . }}
app.kubernetes.io/version: {{ .Values.image.tag | default .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "app.image" -}}
{{- $tag := required "image.tag is required (pass --set image.tag=<tag>); 'latest' is not allowed" .Values.image.tag }}
{{- if eq (toString $tag) "latest" }}{{ fail "image.tag must not be 'latest'" }}{{ end }}
{{- printf "%s:%s" .Values.image.repository (toString $tag) }}
{{- end }}

{{- define "app.dbClusterName" -}}
{{- printf "%s-db" (include "app.fullname" .) | trunc 50 | trimSuffix "-" }}
{{- end }}

{{/* Name of the Secret that holds the connection URI under key "uri". */}}
{{- define "app.dbSecretName" -}}
{{- if .Values.database.existingSecret }}
{{- .Values.database.existingSecret }}
{{- else }}
{{- printf "%s-app" (include "app.dbClusterName" .) }}
{{- end }}
{{- end }}

{{/* Environment shared by the app container and the migration job. */}}
{{- define "app.env" -}}
- name: PORT
  value: {{ .Values.containerPort | quote }}
{{- if or .Values.database.enabled .Values.database.existingSecret }}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "app.dbSecretName" . }}
      key: uri
{{- end }}

{{- range $key, $value := .Values.env }}
- name: {{ $key }}
  value: {{ $value | quote }}
{{- end }}
{{- range .Values.envFromSecrets }}
- name: {{ .name }}
  valueFrom:
    secretKeyRef:
      name: {{ .secretName }}
      key: {{ .key }}
{{- end }}
{{- end }}

{{- define "app.containerSecurityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
runAsNonRoot: true
capabilities:
  drop: ["ALL"]
{{- end }}

{{- define "app.podSecurityContext" -}}
runAsNonRoot: true
runAsUser: 10001
runAsGroup: 10001
fsGroup: 10001
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{/* Service account used by the API pods. */}}
{{- define "app.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- include "app.fullname" . }}
{{- else }}
default
{{- end }}
{{- end }}
