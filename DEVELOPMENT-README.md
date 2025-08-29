# Ì∫® SECURITY FIRST DEVELOPMENT WORKFLOW

## Ì¥í Mandatory Security Protocol

**EVERY CODE CHANGE MUST BE SCANNED WITH SEMGREP**

### Ì≥ã Pre-Development Checklist:
- [ ] Run `semgrep --config auto --include="*.js" .` BEFORE starting development
- [ ] Address any HIGH/CRITICAL issues found
- [ ] Run `./check-security.sh` after major changes
- [ ] Test security fixes thoroughly

### Ì¥Ñ Development Workflow:
1. **Write Code** ‚Üí 2. **Run Semgrep** ‚Üí 3. **Fix Issues** ‚Üí 4. **Test** ‚Üí 5. **Commit**

### Ì∫´ Never Skip Security:
- **XSS Vulnerabilities**: Check innerHTML usage
- **Input Sanitization**: Verify user data handling  
- **URL Validation**: Ensure safe URL handling
- **Error Handling**: Check for information leakage

### Ìª†Ô∏è Quick Commands:
```bash
# Manual security scan
semgrep --config auto --include="*.js" .

# Automated security check
./check-security.sh

# High-priority issues only
semgrep --config auto --include="*.js" --severity HIGH,CRITICAL .
```

### Ì≤° Remember:
**Security is not optional - it's mandatory for every code change!**

**Violations will be caught by pre-commit hooks and CI/CD pipelines.**
