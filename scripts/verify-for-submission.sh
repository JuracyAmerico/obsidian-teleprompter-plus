#!/bin/bash
# Obsidian Plugin Submission Verification Script
# Run this BEFORE creating a release for community plugin submission
# Created: 2026-01-02 after 6 failed attempts on PR #9198

set -e

echo "========================================="
echo "Obsidian Plugin Submission Verification"
echo "========================================="
echo ""

ERRORS=0
WARNINGS=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

# 1. Check for 'any' types
echo "1. Checking for 'any' types..."
ANY_COUNT=$(grep -rn ": any" src/*.ts 2>/dev/null | grep -v "node_modules" | wc -l | tr -d ' ')
if [ "$ANY_COUNT" -gt 0 ]; then
    check_fail "Found $ANY_COUNT 'any' types - use Record<string, unknown> or proper interfaces"
    grep -rn ": any" src/*.ts | grep -v "node_modules" | head -5
else
    check_pass "No 'any' types found"
fi

# 2. Check for console.log
echo ""
echo "2. Checking for console.log..."
LOG_COUNT=$(grep -rn "console\.log" src/*.ts 2>/dev/null | wc -l | tr -d ' ')
if [ "$LOG_COUNT" -gt 0 ]; then
    check_fail "Found $LOG_COUNT console.log statements - use console.debug/warn/error"
    grep -rn "console\.log" src/*.ts | head -5
else
    check_pass "No console.log found"
fi

# 3. Check for NodeJS.Timeout
echo ""
echo "3. Checking for NodeJS.Timeout..."
TIMEOUT_COUNT=$(grep -rn "NodeJS\.Timeout" src/*.ts 2>/dev/null | wc -l | tr -d ' ')
if [ "$TIMEOUT_COUNT" -gt 0 ]; then
    check_fail "Found $TIMEOUT_COUNT NodeJS.Timeout - use ReturnType<typeof setTimeout>"
    grep -rn "NodeJS\.Timeout" src/*.ts | head -5
else
    check_pass "No NodeJS.Timeout found"
fi

# 4. Check for confirm() or alert()
echo ""
echo "4. Checking for native dialogs..."
DIALOG_COUNT=$(grep -rn "confirm(\|alert(" src/*.ts 2>/dev/null | grep -v "// \|/\*\|\*" | grep -v "confirm-modal" | wc -l | tr -d ' ')
if [ "$DIALOG_COUNT" -gt 0 ]; then
    check_fail "Found $DIALOG_COUNT native dialogs - use Obsidian modals"
    grep -rn "confirm(\|alert(" src/*.ts | head -5
else
    check_pass "No native dialogs found"
fi

# 5. Check for potential sentence case violations in UI text
echo ""
echo "5. Checking for sentence case violations..."
# Look for patterns like "Some Word" in setName/setDesc/text
CASE_COUNT=$(grep -rn "setName\|setDesc\|text:" src/*.ts 2>/dev/null | grep -E "'[A-Z][a-z]+ [A-Z][a-z]+" | grep -v "Stream Deck\|Ko-fi\|GitHub\|Teleprompter Plus" | wc -l | tr -d ' ')
if [ "$CASE_COUNT" -gt 0 ]; then
    check_warn "Found $CASE_COUNT potential sentence case issues - review manually"
    grep -rn "setName\|setDesc\|text:" src/*.ts | grep -E "'[A-Z][a-z]+ [A-Z][a-z]+" | grep -v "Stream Deck\|Ko-fi\|GitHub\|Teleprompter Plus" | head -10
else
    check_pass "No obvious sentence case violations"
fi

# 6. Check manifest.json
echo ""
echo "6. Checking manifest.json..."
if [ -f "manifest.json" ]; then
    VERSION=$(cat manifest.json | grep '"version"' | sed 's/.*: "\(.*\)".*/\1/')
    DESC=$(cat manifest.json | grep '"description"' | sed 's/.*: "\(.*\)".*/\1/')

    # Check version doesn't start with 'v'
    if [[ "$VERSION" == v* ]]; then
        check_fail "Version starts with 'v' - remove it: $VERSION"
    else
        check_pass "Version format OK: $VERSION"
    fi

    # Check description ends with punctuation
    if [[ "$DESC" =~ [\.\?\!\)]$ ]]; then
        check_pass "Description ends with punctuation"
    else
        check_fail "Description must end with . ? ! or )"
    fi
else
    check_fail "manifest.json not found"
fi

# 7. Check build output exists
echo ""
echo "7. Checking build output..."
if [ -f "dist/main.js" ] && [ -f "dist/styles.css" ]; then
    check_pass "Build output exists"
else
    check_warn "Build output missing - run 'bun run build'"
fi

# Summary
echo ""
echo "========================================="
echo "SUMMARY"
echo "========================================="
if [ "$ERRORS" -gt 0 ]; then
    echo -e "${RED}FAILED${NC}: $ERRORS errors, $WARNINGS warnings"
    echo ""
    echo "Fix all errors before submitting!"
    exit 1
elif [ "$WARNINGS" -gt 0 ]; then
    echo -e "${YELLOW}PASSED WITH WARNINGS${NC}: $WARNINGS warnings"
    echo ""
    echo "Review warnings manually before submitting."
    exit 0
else
    echo -e "${GREEN}PASSED${NC}: All checks passed!"
    echo ""
    echo "Ready to create release."
    exit 0
fi
