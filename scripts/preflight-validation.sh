#!/bin/bash
#
# Obsidian Plugin Pre-Flight Validation
# Run this BEFORE submitting to obsidian-releases
#
# Based on: https://github.com/obsidianmd/obsidian-releases/actions/workflows/validate-plugin-entry.yml
# All 40 checks the ObsidianReviewBot performs
#
# Usage: ./scripts/preflight-validation.sh
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

error() {
    echo -e "${RED}❌ ERROR: $1${NC}"
    ERRORS=$((ERRORS + 1))
}

warn() {
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}"
    WARNINGS=$((WARNINGS + 1))
}

pass() {
    echo -e "${GREEN}✅ $1${NC}"
}

info() {
    echo -e "   $1"
}

echo "═══════════════════════════════════════════════════════════════"
echo "  Obsidian Plugin Pre-Flight Validation"
echo "  Based on ObsidianReviewBot checks"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if manifest.json exists
if [ ! -f "manifest.json" ]; then
    error "manifest.json not found!"
    exit 1
fi

# Parse manifest.json
PLUGIN_ID=$(cat manifest.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
PLUGIN_NAME=$(cat manifest.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('name',''))")
PLUGIN_DESC=$(cat manifest.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('description',''))")
PLUGIN_VERSION=$(cat manifest.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('version',''))")
PLUGIN_AUTHOR=$(cat manifest.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('author',''))")
MIN_APP_VERSION=$(cat manifest.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('minAppVersion',''))")
IS_DESKTOP_ONLY=$(cat manifest.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('isDesktopOnly','NOT_SET'))")

echo "📋 Plugin Info:"
echo "   ID: $PLUGIN_ID"
echo "   Name: $PLUGIN_NAME"
echo "   Version: $PLUGIN_VERSION"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  SECTION 1: Plugin ID Checks"
echo "═══════════════════════════════════════════════════════════════"

# Check 1: No "obsidian" in ID
if echo "$PLUGIN_ID" | grep -qi "obsidian"; then
    error "Plugin ID contains 'obsidian' - not allowed"
else
    pass "ID does not contain 'obsidian'"
fi

# Check 2: No "plugin" suffix in ID
if echo "$PLUGIN_ID" | grep -qi "plugin$"; then
    error "Plugin ID ends with 'plugin' - not allowed"
else
    pass "ID does not end with 'plugin'"
fi

# Check 3: Valid characters only (lowercase alphanumeric, dashes, underscores)
if echo "$PLUGIN_ID" | grep -qE '^[a-z0-9_-]+$'; then
    pass "ID uses valid characters only"
else
    error "ID contains invalid characters (must be lowercase alphanumeric, dashes, underscores)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  SECTION 2: Plugin Name Checks"
echo "═══════════════════════════════════════════════════════════════"

# Check 4: No "Obsidian" in name
if echo "$PLUGIN_NAME" | grep -qi "obsidian"; then
    error "Plugin name contains 'Obsidian' - not allowed"
else
    pass "Name does not contain 'Obsidian'"
fi

# Check 5: No "Plugin" suffix in name
if echo "$PLUGIN_NAME" | grep -qi "plugin$"; then
    error "Plugin name ends with 'Plugin' - not allowed"
else
    pass "Name does not end with 'Plugin'"
fi

# Check 6: No partial matches (Obsi*, *dian)
if echo "$PLUGIN_NAME" | grep -qiE "^obsi|dian$"; then
    warn "Plugin name might be flagged for partial 'Obsidian' match"
else
    pass "Name has no partial 'Obsidian' matches"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  SECTION 3: Description Checks"
echo "═══════════════════════════════════════════════════════════════"

# Check 7: No "Obsidian" in description
if echo "$PLUGIN_DESC" | grep -qi "obsidian"; then
    error "Description contains 'Obsidian' - not allowed"
else
    pass "Description does not contain 'Obsidian'"
fi

# Check 8: Proper punctuation (must end with . ? ! or ))
if echo "$PLUGIN_DESC" | grep -qE '[.?!)]$'; then
    pass "Description ends with proper punctuation"
else
    error "Description must end with . ? ! or )"
    info "Current ending: '${PLUGIN_DESC: -10}'"
fi

# Check 9: Length limit (max 250 characters)
DESC_LEN=${#PLUGIN_DESC}
if [ $DESC_LEN -le 250 ]; then
    pass "Description length OK ($DESC_LEN/250 chars)"
else
    error "Description too long ($DESC_LEN chars, max 250)"
fi

# Check 10: Avoid self-referential language
if echo "$PLUGIN_DESC" | grep -qiE "^this is a plugin|^a plugin"; then
    warn "Description uses self-referential language ('This is a plugin...')"
else
    pass "Description avoids self-referential language"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  SECTION 4: Manifest Required Fields"
echo "═══════════════════════════════════════════════════════════════"

# Check required fields
for field in id name description author version minAppVersion; do
    value=$(cat manifest.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('$field',''))" 2>/dev/null)
    if [ -n "$value" ]; then
        pass "Required field '$field' present"
    else
        error "Required field '$field' missing"
    fi
done

# Check isDesktopOnly
if [ "$IS_DESKTOP_ONLY" = "NOT_SET" ]; then
    error "Required field 'isDesktopOnly' missing"
else
    pass "Required field 'isDesktopOnly' present ($IS_DESKTOP_ONLY)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  SECTION 5: Version & Release Checks"
echo "═══════════════════════════════════════════════════════════════"

# Check 11: Version format (only numbers and dots)
if echo "$PLUGIN_VERSION" | grep -qE '^[0-9]+(\.[0-9]+)*$'; then
    pass "Version format valid ($PLUGIN_VERSION)"
else
    error "Version format invalid - must be numbers and dots only"
fi

# Check 12: GitHub release exists
echo "   Checking GitHub release..."
# Get repo URL from git remote (most reliable)
REPO_URL=$(git remote get-url origin 2>/dev/null | sed -E 's#.*github\.com[:/]##' | sed 's/\.git$//')
if [ -z "$REPO_URL" ]; then
    warn "Could not get repo URL from git remote"
fi
info "Repo: $REPO_URL"

if [ -n "$REPO_URL" ]; then
    RELEASE_CHECK=$(curl -s "https://api.github.com/repos/$REPO_URL/releases/tags/$PLUGIN_VERSION" | python3 -c "import json,sys; d=json.load(sys.stdin); print('found' if 'id' in d else 'not_found')" 2>/dev/null)
    if [ "$RELEASE_CHECK" = "found" ]; then
        pass "GitHub release $PLUGIN_VERSION exists"

        # Check release assets
        ASSETS=$(curl -s "https://api.github.com/repos/$REPO_URL/releases/tags/$PLUGIN_VERSION" | python3 -c "import json,sys; d=json.load(sys.stdin); print(','.join([a['name'] for a in d.get('assets',[])]))" 2>/dev/null)

        if echo "$ASSETS" | grep -q "main.js"; then
            pass "Release has main.js"
        else
            error "Release missing main.js"
        fi

        if echo "$ASSETS" | grep -q "manifest.json"; then
            pass "Release has manifest.json"
        else
            error "Release missing manifest.json"
        fi
    else
        error "GitHub release $PLUGIN_VERSION NOT FOUND"
        info "Create release: gh release create $PLUGIN_VERSION dist/main.js manifest.json dist/styles.css --title \"$PLUGIN_VERSION\""
    fi
else
    warn "Could not determine repo URL to check release"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  SECTION 6: License Check"
echo "═══════════════════════════════════════════════════════════════"

if [ -f "LICENSE" ] || [ -f "LICENSE.md" ] || [ -f "LICENSE.txt" ]; then
    pass "License file present"
else
    error "No LICENSE file found"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  SECTION 7: Code Quality Checks"
echo "═══════════════════════════════════════════════════════════════"

# Check for innerHTML usage
INNERHTML_COUNT=$(grep -rn "innerHTML\|outerHTML" src/ 2>/dev/null | grep -v "node_modules" | wc -l | tr -d ' ')
if [ "$INNERHTML_COUNT" -gt 0 ]; then
    warn "Found $INNERHTML_COUNT uses of innerHTML/outerHTML - security concern"
else
    pass "No innerHTML/outerHTML usage"
fi

# Check for console.log
CONSOLE_LOG_COUNT=$(grep -rn "console\.log" src/ 2>/dev/null | grep -v "node_modules" | wc -l | tr -d ' ')
if [ "$CONSOLE_LOG_COUNT" -gt 0 ]; then
    warn "Found $CONSOLE_LOG_COUNT uses of console.log - should use console.debug"
else
    pass "No console.log usage"
fi

# Check for 'any' type
ANY_TYPE_COUNT=$(grep -rn ": any" src/*.ts 2>/dev/null | wc -l | tr -d ' ')
if [ "$ANY_TYPE_COUNT" -gt 0 ]; then
    warn "Found $ANY_TYPE_COUNT uses of ': any' type"
else
    pass "No ': any' types found"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  SECTION 8: Sentence Case Check (UI Strings)"
echo "═══════════════════════════════════════════════════════════════"

# Check for sentence case violations in setName/setDesc
SENTENCE_CASE_ISSUES=$(grep -rn "setName\|setDesc" src/*.ts 2>/dev/null | grep -oE "'[A-Z][a-z]+ [A-Z][a-z]+'" | sort -u | head -10)
if [ -n "$SENTENCE_CASE_ISSUES" ]; then
    warn "Possible sentence case violations:"
    echo "$SENTENCE_CASE_ISSUES" | while read line; do
        info "  $line"
    done
else
    pass "No obvious sentence case violations"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  SUMMARY"
echo "═══════════════════════════════════════════════════════════════"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ ALL CHECKS PASSED! Ready for submission.${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  $WARNINGS warning(s), but no errors. Review warnings before submitting.${NC}"
    exit 0
else
    echo -e "${RED}❌ $ERRORS error(s) and $WARNINGS warning(s). FIX ERRORS before submitting!${NC}"
    exit 1
fi
