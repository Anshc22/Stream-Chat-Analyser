#!/bin/bash
echo "� Running Comprehensive Security Scan..."

echo "� Semgrep Code Analysis:"
semgrep --config auto --include="*.js" .

echo ""
echo "� Security Checklist:"
echo "✅ XSS Prevention: Check for innerHTML usage"
echo "✅ Input Sanitization: Verify user data handling"
echo "✅ URL Validation: Ensure safe URL handling"
echo "✅ Error Handling: Check for information leakage"

echo ""
echo "� Fix any HIGH/CRITICAL issues before committing!"
