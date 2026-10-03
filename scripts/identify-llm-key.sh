#!/usr/bin/env bash
# Tells you which Supabase secret an API key is (Supabase lists a SHA-256 digest
# of every secret, so the key is hashed locally and compared; it is never printed or sent).
# Optionally sets the matching GitHub Actions secret from the same input.
#   scripts/identify-llm-key.sh              # paste key at the hidden prompt
#   scripts/identify-llm-key.sh --clipboard  # copy the key, press Enter (use if pasting fails)
set -euo pipefail
clean() { sed $'s/\x1b\\[[0-9;]*[~A-Za-z]//g' | tr -d '[:space:]'; }
while true; do
  if [ "${1:-}" = "--clipboard" ]; then
    read -rp "Copy a key to the clipboard, then press Enter (q to quit): " ans
    [ "$ans" = q ] && exit 0
    key=$(pbpaste | clean)
  else
    read -rsp "Paste a key (empty to quit): " key; echo
    key=$(printf %s "$key" | clean)
  fi
  [ -z "$key" ] && exit 0
  digest=$(printf %s "$key" | shasum -a 256 | cut -d' ' -f1)
  name=$(supabase secrets list -o json 2>/dev/null | DIGEST="$digest" python3 -c "
import sys,json,os
d=json.load(sys.stdin); r=d['secrets'] if isinstance(d,dict) else d
print(next((s['name'] for s in r if s['value']==os.environ['DIGEST']),''))")
  if [ -z "$name" ]; then echo "No Supabase secret matches that key (${#key} characters read)."; continue; fi
  echo "That key is $name."
  read -rp "Also set it as the GitHub secret $name? [y/N] " yn
  if [ "$yn" = y ]; then printf %s "$key" | gh secret set "$name" && echo "GitHub secret $name set."; fi
done
