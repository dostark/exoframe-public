#!/usr/bin/env bash
set -e

# Script to run tests with coverage and generate reports
# Usage: ./scripts/coverage.sh [format] [options]
# Formats: summary (default), html, lcov, detailed, all
# Options: --with-llama (include LlamaProvider tests)

FORMAT="${1:-summary}"
WITH_LLAMA=false

# Parse options
for arg in "$@"; do
  case $arg in
    --with-llama)
      WITH_LLAMA=true
      shift
      ;;
  esac
done

COVERAGE_DIR="coverage"
SRC_PATTERN="^file://$(pwd)/src/"

echo "🧪 Running tests with coverage..."
rm -rf "$COVERAGE_DIR"

if [ "$WITH_LLAMA" = true ]; then
  echo "Including LlamaProvider tests..."
  deno test --allow-all --coverage="$COVERAGE_DIR" tests/
else
  echo "Excluding LlamaProvider tests (use --with-llama to include them)..."
  deno test --allow-all --coverage="$COVERAGE_DIR" --ignore="tests/llama_provider_test.ts" tests/
fi

echo ""
echo "📊 Generating coverage report..."

case "$FORMAT" in
  summary)
    deno coverage "$COVERAGE_DIR" \
      --include="$SRC_PATTERN" \
      --exclude="test\.(ts|js)$"
    ;;

  html)
    deno coverage "$COVERAGE_DIR" \
      --include="$SRC_PATTERN" \
      --exclude="test\.(ts|js)$" \
      --html
    echo ""
    echo "✅ HTML report generated: file://$(pwd)/$COVERAGE_DIR/html/index.html"
    ;;

  lcov)
    deno coverage "$COVERAGE_DIR" \
      --include="$SRC_PATTERN" \
      --exclude="test\.(ts|js)$" \
      --lcov \
      --output="$COVERAGE_DIR/lcov.info"
    echo ""
    echo "✅ LCOV report generated: $COVERAGE_DIR/lcov.info"
    ;;

  detailed)
    deno coverage "$COVERAGE_DIR" \
      --include="$SRC_PATTERN" \
      --exclude="test\.(ts|js)$" \
      --detailed
    ;;

  all)
    # Generate all formats
    echo "Generating summary..."
    deno coverage "$COVERAGE_DIR" \
      --include="$SRC_PATTERN" \
      --exclude="test\.(ts|js)$"

    echo ""
    echo "Generating HTML report..."
    deno coverage "$COVERAGE_DIR" \
      --include="$SRC_PATTERN" \
      --exclude="test\.(ts|js)$" \
      --html

    echo ""
    echo "Generating LCOV report..."
    deno coverage "$COVERAGE_DIR" \
      --include="$SRC_PATTERN" \
      --exclude="test\.(ts|js)$" \
      --lcov \
      --output="$COVERAGE_DIR/lcov.info"

    echo ""
    echo "✅ All reports generated:"
    echo "   - Summary: printed above"
    echo "   - HTML: file://$(pwd)/$COVERAGE_DIR/html/index.html"
    echo "   - LCOV: $COVERAGE_DIR/lcov.info"
    ;;

  *)
    echo "❌ Unknown format: $FORMAT"
    echo "Usage: $0 [summary|html|lcov|detailed|all]"
    exit 1
    ;;
esac

echo ""
echo "✅ Done!"
