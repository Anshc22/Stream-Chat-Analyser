#!/bin/bash
echo "� Setting up Semgrep Security Integration..."

# Create pre-commit hook
mkdir -p .git/hooks
cat > .git/hooks/pre-commit << 'HOOK_EOF'
#!/bin/bash
echo "� Running Semgrep security scan..."

# Run Semgrep scan
semgrep --config auto --include="*.js" --severity HIGH,CRITICAL . --error

# Check if Semgrep found critical issues
if [ $? -eq 0 ]; then
    echo "✅ No critical security issues found!"
    exit 0
else
    echo "❌ Critical security issues found! Please fix before committing."
    echo "� Run: semgrep --config auto --include=\"*.js\" ."
    exit 1
fi
HOOK_EOF

chmod +x .git/hooks/pre-commit
echo "✅ Pre-commit hook created"

# Create security check script
cat > check-security.sh << 'SEC_EOF'
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
SEC_EOF

chmod +x check-security.sh
echo "✅ Security check script created"

echo "� Semgrep integration complete!"
echo "� Usage:"
echo "   • Run './check-security.sh' manually"
echo "   • Security scans run automatically on commit"
