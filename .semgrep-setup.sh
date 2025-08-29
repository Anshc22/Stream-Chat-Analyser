#!/bin/bash
echo "í´§ Setting up Semgrep Security Integration..."

# Create pre-commit hook
mkdir -p .git/hooks
cat > .git/hooks/pre-commit << 'HOOK_EOF'
#!/bin/bash
echo "í´ Running Semgrep security scan..."

# Run Semgrep scan
semgrep --config auto --include="*.js" --severity HIGH,CRITICAL . --error

# Check if Semgrep found critical issues
if [ $? -eq 0 ]; then
    echo "âœ… No critical security issues found!"
    exit 0
else
    echo "âŒ Critical security issues found! Please fix before committing."
    echo "í²¡ Run: semgrep --config auto --include=\"*.js\" ."
    exit 1
fi
HOOK_EOF

chmod +x .git/hooks/pre-commit
echo "âœ… Pre-commit hook created"

# Create security check script
cat > check-security.sh << 'SEC_EOF'
#!/bin/bash
echo "í´ Running Comprehensive Security Scan..."

echo "í³Š Semgrep Code Analysis:"
semgrep --config auto --include="*.js" .

echo ""
echo "í³‹ Security Checklist:"
echo "âœ… XSS Prevention: Check for innerHTML usage"
echo "âœ… Input Sanitization: Verify user data handling"
echo "âœ… URL Validation: Ensure safe URL handling"
echo "âœ… Error Handling: Check for information leakage"

echo ""
echo "í²¡ Fix any HIGH/CRITICAL issues before committing!"
SEC_EOF

chmod +x check-security.sh
echo "âœ… Security check script created"

echo "í¾‰ Semgrep integration complete!"
echo "í²¡ Usage:"
echo "   â€¢ Run './check-security.sh' manually"
echo "   â€¢ Security scans run automatically on commit"
