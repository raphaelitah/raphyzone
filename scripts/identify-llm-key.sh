#!/usr/bin/env bash
# Tells you which Supabase secret a pasted API key is (Supabase lists a SHA-256 digest
# of every secret, so the key is hashed locally and compared; it is never printed or sent).
# Optionally sets the matching GitHub Actions secret from the same input.
#   scripts/identify-llm-key.sh          # paste key at the hidden prompt, repeat per key
set -euo pipefail
while true; do
  read -rsp "Paste a key (empty to quit): " key; echo
  [ -z "$key" ] && exit 0
  digest=$(printf %s "$key" | shasum -a 256 | cut -d' ' -f1)
  name=$(supabase secrets list -o json 2>/dev/null | DIGEST="$digest" python3 -c "
import sys,json,os
d=json.load(sys.stdin); r=d['secrets'] if isinstance(d,dict) else d
print(next((s['name'] for s in r if s['value']==os.environ['DIGEST']),''))")
  if [ -z "$name" ]; then echo "No Supabase secret matches that key."; continue; fi
  echo "That key is $name."
  read -rp "Also set it as the GitHub secret $name? [y/N] " yn
  [ "$yn" = y ] && printf %s "$key" | gh secret set "$name" && echo "GitHub secret $name set."
done
