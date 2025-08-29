#!/bin/bash
echo "Ì¥ç Running Comprehensive Security Scan..."

echo "Ì≥ä Semgrep Code Analysis:"
semgrep --config auto --include="*.js" .

echo ""
echo "Ì≥ã Security Checklist:"
echo "‚úÖ XSS Prevention: Check for innerHTML usage"
echo "‚úÖ Input Sanitization: Verify user data handling"
echo "‚úÖ URL Validation: Ensure safe URL handling"
echo "‚úÖ Error Handling: Check for information leakage"

echo ""
echo "Ì≤° Fix any HIGH/CRITICAL issues before committing!"
