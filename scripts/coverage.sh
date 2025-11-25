#!/usr/bin/env bash
set -e

# Script to run tests with coverage and generate reports
# Usage: ./scripts/coverage.sh [format]
# Formats: summary (default), html, lcov, detailed

FORMAT="${1:-summary}"
COVERAGE_DIR="coverage"
SRC_PATTERN="^file://$(pwd)/src/"

echo "🧪 Running tests with coverage..."
rm -rf "$COVERAGE_DIR"
deno test --allow-all --coverage="$COVERAGE_DIR" tests/

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
