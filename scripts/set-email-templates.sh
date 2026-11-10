#!/usr/bin/env bash
# Pushes supabase/templates/otp.html as the "Magic Link" and "Confirm signup" emails,
# so email sign-in sends a 6-digit code instead of a link.
# Usage: SUPABASE_ACCESS_TOKEN=sbp_... ./scripts/set-email-templates.sh
# Token: https://supabase.com/dashboard/account/tokens (delete it afterwards if you like)
set -euo pipefail
: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN}"
REF=ouqcqcyialpvibrldtyl
DIR="$(cd "$(dirname "$0")/.." && pwd)"

body=$(python3 -c '
import json, sys
html = open(sys.argv[1]).read()
subject = "Your CatchLog sign-in code"
print(json.dumps({
  "mailer_subjects_magic_link": subject,
  "mailer_templates_magic_link_content": html,
  "mailer_subjects_confirmation": subject,
  "mailer_templates_confirmation_content": html,
}))' "$DIR/supabase/templates/otp.html")

curl -fsS -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$body" \
| python3 -c 'import json,sys; c=json.load(sys.stdin); print("magic link has code:", "{{ .Token }}" in (c.get("mailer_templates_magic_link_content") or "")); print("confirm signup has code:", "{{ .Token }}" in (c.get("mailer_templates_confirmation_content") or ""))'
