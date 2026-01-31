#!/bin/sh
INPUT=$(cat)
CMD=$(printf '%s\n' "$INPUT" | sed -n 's/.*"command":"\(.*\)".*/\1/p' | sed 's/\\"/"/g')
blocked() {
  printf '%s\n' '{"permission":"deny","user_message":"Blocked by project policy.","agent_message":"This command is not allowed."}'
  exit 2
}
case "$CMD" in
  *'rm -rf /'*|*'rm -rf /*'*) blocked ;;
  *':(){ :|:& };:'*) blocked ;;
  *'mkfs '*|*'mkfs.'*) blocked ;;
  *'dd if='*'of=/dev/'*) blocked ;;
  *'format '*'c:'*|*'format C:'*) blocked ;;
  *) printf '%s\n' '{"permission":"allow"}'; exit 0 ;;
esac
