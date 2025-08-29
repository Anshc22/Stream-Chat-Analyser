# � SECURITY FIRST DEVELOPMENT WORKFLOW

## � Mandatory Security Protocol

**EVERY CODE CHANGE MUST BE SCANNED WITH SEMGREP**

### � Pre-Development Checklist:
- [ ] Run `semgrep --config auto --include="*.js" .` BEFORE starting development
- [ ] Address any HIGH/CRITICAL issues found
- [ ] Run `./check-security.sh` after major changes
- [ ] Test security fixes thoroughly

### � Development Workflow:
1. **Write Code** → 2. **Run Semgrep** → 3. **Fix Issues** → 4. **Test** → 5. **Commit**

### � Never Skip Security:
- **XSS Vulnerabilities**: Check innerHTML usage
- **Input Sanitization**: Verify user data handling  
- **URL Validation**: Ensure safe URL handling
- **Error Handling**: Check for information leakage

### �️ Quick Commands:
```bash
# Manual security scan
semgrep --config auto --include="*.js" .

# Automated security check
./check-security.sh

# High-priority issues only
semgrep --config auto --include="*.js" --severity HIGH,CRITICAL .
```

### � Remember:
**Security is not optional - it's mandatory for every code change!**

**Violations will be caught by pre-commit hooks and CI/CD pipelines.**
