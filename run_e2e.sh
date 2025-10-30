#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT_DIR}/packages/prd-agent/agent/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Environment file not found at ${ENV_FILE}" >&2
  exit 1
fi

OPENROUTER_API_KEY=$(grep -E '^OPENROUTER_API_KEY=' "$ENV_FILE" | tail -n1 | cut -d'=' -f2-)

if [[ -z "${OPENROUTER_API_KEY}" ]]; then
  echo "OPENROUTER_API_KEY not found in ${ENV_FILE}" >&2
  exit 1
fi

echo "Running PRD E2E test with workspace at ${ROOT_DIR}"
cd "${ROOT_DIR}/packages/product-agent"
RUN_PRODUCT_AGENT_E2E=true OPENROUTER_API_KEY="${OPENROUTER_API_KEY}" \
  npm run test -- --test-name-pattern='prd-e2e'
